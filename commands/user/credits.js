const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { query } = require('../../config/database');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('credits')
        .setDescription('Affiche votre solde de crédits et vos informations de compte'),
    
    cooldown: 3,

    async execute(interaction) {
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            // Récupérer les données de l'utilisateur
            const userResult = await query('SELECT * FROM users WHERE discord_id = ?', [interaction.user.id]);
            const user = userResult[0];

            if (!user) {
                return interaction.editReply({ content: '❌ Erreur: utilisateur non trouvé dans la base de données.' });
            }

            // Récupérer les dernières transactions
            const transactionsResult = await query(
                'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 5',
                [interaction.user.id]
            );

            // Créer l'embed principal
            const embed = new EmbedBuilder()
                .setTitle('💰 Informations de votre compte')
                .setColor(getStatusColor(user.status))
                .setThumbnail(interaction.user.displayAvatarURL())
                .setTimestamp()
                .setFooter({ text: 'MenMuse Bot', iconURL: interaction.client.user.displayAvatarURL() });

            // Informations principales
            embed.addFields(
                {
                    name: '💳 Solde actuel',
                    value: `**${user.credits}** crédits`,
                    inline: true
                },
                {
                    name: '📊 Statut',
                    value: getStatusDisplay(user.status),
                    inline: true
                },
                {
                    name: '🔗 Code de parrainage',
                    value: `\`${user.referral_code}\``,
                    inline: true
                }
            );

            // Informations premium si applicable
            if (user.status === 'premium' && user.premium_until) {
                const premiumDate = new Date(user.premium_until);
                const now = new Date();
                
                if (premiumDate > now) {
                    embed.addFields({
                        name: '👑 Premium jusqu\'au',
                        value: `<t:${Math.floor(premiumDate.getTime() / 1000)}:F>`,
                        inline: false
                    });
                }
            }

            // Informations sur les coûts
            embed.addFields({
                name: '💸 Coûts des services',
                value: `📄 Génération PDF: **${config.credits.pdfCost}** crédits\n🎁 Bonus parrainage: **${config.credits.referralReward}** crédits`,
                inline: false
            });

            // Historique des transactions
            if (transactionsResult.length > 0) {
                const transactionHistory = transactionsResult.map(t => {
                    const date = new Date(t.created_at);
                    const emoji = t.type === 'credit' || t.type === 'referral' || t.type === 'admin' ? '➕' : '➖';
                    const sign = t.type === 'debit' ? '-' : '+';
                    return `${emoji} ${sign}${t.amount} - ${t.description || 'Aucune description'} (<t:${Math.floor(date.getTime() / 1000)}:R>)`;
                }).join('\n');

                embed.addFields({
                    name: '📜 Dernières transactions',
                    value: transactionHistory.length > 1024 ? transactionHistory.substring(0, 1021) + '...' : transactionHistory,
                    inline: false
                });
            } else {
                embed.addFields({
                    name: '📜 Dernières transactions',
                    value: 'Aucune transaction trouvée',
                    inline: false
                });
            }

            // Statistiques d'utilisation
            const usageResult = await query(
                'SELECT COUNT(*) as total_actions, SUM(credits_used) as total_credits FROM usage_logs WHERE user_id = ?',
                [interaction.user.id]
            );

            if (usageResult[0]) {
                const stats = usageResult[0];
                embed.addFields({
                    name: '📈 Statistiques d\'utilisation',
                    value: `Actions totales: **${stats.total_actions}**\nCrédits dépensés: **${stats.total_credits || 0}**`,
                    inline: false
                });
            }

            // Informations sur le parrainage
            const referralResult = await query(
                'SELECT COUNT(*) as referrals FROM users WHERE referred_by = ?',
                [interaction.user.id]
            );

            if (referralResult[0] && referralResult[0].referrals > 0) {
                embed.addFields({
                    name: '👥 Parrainages',
                    value: `Vous avez parrainé **${referralResult[0].referrals}** utilisateur(s)`,
                    inline: false
                });
            }

            // Conseils selon le statut
            let tips = '';
            if (user.status === 'gratuit') {
                if (user.credits < config.credits.pdfCost) {
                    tips = '💡 **Conseil:** Vos crédits sont insuffisants. Contactez un administrateur pour recharger votre compte ou parrainez des amis !';
                } else {
                    tips = '💡 **Conseil:** Parrainez des amis avec votre code pour gagner des crédits bonus !';
                }
            } else if (user.status === 'premium') {
                tips = '👑 **Avantage Premium:** Vous bénéficiez de générations PDF illimitées !';
            }

            if (tips) {
                embed.addFields({
                    name: '💡 Informations',
                    value: tips,
                    inline: false
                });
            }

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Erreur lors de l\'affichage des crédits:', error);
            
            const errorMessage = '❌ Une erreur est survenue lors de la récupération de vos informations.';
            
            if (interaction.deferred) {
                await interaction.editReply({ content: errorMessage });
            } else {
                await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
            }
        }
    },
};

function getStatusColor(status) {
    switch (status) {
        case 'premium':
            return '#FFD700'; // Or
        case 'staff':
            return '#9B59B6'; // Violet
        case 'banni':
            return '#E74C3C'; // Rouge
        default:
            return '#3498DB'; // Bleu
    }
}

function getStatusDisplay(status) {
    switch (status) {
        case 'gratuit':
            return '🆓 Gratuit';
        case 'premium':
            return '👑 Premium';
        case 'staff':
            return '🛡️ Staff';
        case 'banni':
            return '🚫 Banni';
        default:
            return '❓ Inconnu';
    }
}