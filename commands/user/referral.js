const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { query } = require('../../config/database');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('referral')
        .setDescription('Gestion du système de parrainage')
        .addSubcommand(subcommand =>
            subcommand
                .setName('code')
                .setDescription('Affiche votre code de parrainage')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('use')
                .setDescription('Utilise un code de parrainage')
                .addStringOption(option =>
                    option.setName('code')
                        .setDescription('Code de parrainage à utiliser')
                        .setRequired(true)
                        .setMaxLength(10)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('Affiche vos statistiques de parrainage')
        ),
    
    cooldown: 5,

    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();

        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            // Récupérer les données de l'utilisateur
            const userResult = await query('SELECT * FROM users WHERE discord_id = ?', [interaction.user.id]);
            const user = userResult[0];

            if (!user) {
                return interaction.editReply({ content: '❌ Erreur: utilisateur non trouvé dans la base de données.' });
            }

            if (user.status === 'banni') {
                return interaction.editReply({ content: '🚫 Vous êtes banni du service.' });
            }

            switch (subcommand) {
                case 'code':
                    await handleCodeSubcommand(interaction, user);
                    break;
                case 'use':
                    await handleUseSubcommand(interaction, user);
                    break;
                case 'stats':
                    await handleStatsSubcommand(interaction, user);
                    break;
            }

        } catch (error) {
            console.error('Erreur lors de l\'exécution de la commande referral:', error);
            
            const errorMessage = '❌ Une erreur est survenue lors du traitement de votre demande.';
            
            if (interaction.deferred) {
                await interaction.editReply({ content: errorMessage });
            } else {
                await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
            }
        }
    },
};

async function handleCodeSubcommand(interaction, user) {
    const embed = new EmbedBuilder()
        .setTitle('🔗 Votre code de parrainage')
        .setColor(config.colors.info)
        .setDescription(`Votre code de parrainage unique est : \`${user.referral_code}\``)
        .addFields(
            {
                name: '💰 Récompense',
                value: `Vous et votre filleul recevrez chacun **${config.credits.referralReward}** crédits`,
                inline: false
            },
            {
                name: '📋 Comment ça marche ?',
                value: '1. Partagez votre code avec vos amis\n2. Ils utilisent `/referral use code:VOTRE_CODE`\n3. Vous recevez tous les deux des crédits !',
                inline: false
            },
            {
                name: '📊 Vos statistiques',
                value: 'Utilisez `/referral stats` pour voir vos parrainages',
                inline: false
            }
        )
        .setTimestamp()
        .setFooter({ text: 'MenMuse Bot', iconURL: interaction.client.user.displayAvatarURL() });

    await interaction.editReply({ embeds: [embed] });
}

async function handleUseSubcommand(interaction, user) {
    const code = interaction.options.getString('code').toUpperCase();

    // Vérifier si l'utilisateur a déjà été parrainé
    if (user.referred_by) {
        return interaction.editReply({ 
            content: '❌ Vous avez déjà été parrainé. Chaque utilisateur ne peut utiliser qu\'un seul code de parrainage.' 
        });
    }

    // Vérifier si le code existe
    const referrerResult = await query('SELECT * FROM users WHERE referral_code = ?', [code]);
    const referrer = referrerResult[0];

    if (!referrer) {
        return interaction.editReply({ content: '❌ Code de parrainage invalide.' });
    }

    // Vérifier que l'utilisateur ne se parraine pas lui-même
    if (referrer.discord_id === interaction.user.id) {
        return interaction.editReply({ content: '❌ Vous ne pouvez pas utiliser votre propre code de parrainage.' });
    }

    // Vérifier que le parrain n'est pas banni
    if (referrer.status === 'banni') {
        return interaction.editReply({ content: '❌ Ce code de parrainage n\'est plus valide.' });
    }

    try {
        // Commencer une transaction
        await query('START TRANSACTION');

        // Mettre à jour l'utilisateur parrainé
        await query(
            'UPDATE users SET referred_by = ?, credits = credits + ? WHERE discord_id = ?',
            [referrer.discord_id, config.credits.referralReward, interaction.user.id]
        );

        // Ajouter des crédits au parrain
        await query(
            'UPDATE users SET credits = credits + ? WHERE discord_id = ?',
            [config.credits.referralReward, referrer.discord_id]
        );

        // Enregistrer les transactions
        await query(
            'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
            [interaction.user.id, 'referral', config.credits.referralReward, `Parrainage utilisé: ${code}`]
        );

        await query(
            'INSERT INTO transactions (user_id, type, amount, description) VALUES (?, ?, ?, ?)',
            [referrer.discord_id, 'referral', config.credits.referralReward, `Parrainage de ${interaction.user.tag}`]
        );

        // Enregistrer la récompense de parrainage
        await query(
            'INSERT INTO referral_rewards (referrer_id, referred_id, reward_amount) VALUES (?, ?, ?)',
            [referrer.discord_id, interaction.user.id, config.credits.referralReward]
        );

        // Valider la transaction
        await query('COMMIT');

        // Créer l'embed de succès
        const embed = new EmbedBuilder()
            .setTitle('🎉 Parrainage réussi !')
            .setColor(config.colors.success)
            .setDescription(`Vous avez utilisé le code de parrainage \`${code}\` avec succès !`)
            .addFields(
                {
                    name: '💰 Récompense reçue',
                    value: `**${config.credits.referralReward}** crédits ajoutés à votre compte`,
                    inline: true
                },
                {
                    name: '👥 Parrainé par',
                    value: `<@${referrer.discord_id}>`,
                    inline: true
                },
                {
                    name: '💳 Nouveau solde',
                    value: `**${user.credits + config.credits.referralReward}** crédits`,
                    inline: true
                }
            )
            .setTimestamp()
            .setFooter({ text: 'MenMuse Bot', iconURL: interaction.client.user.displayAvatarURL() });

        await interaction.editReply({ embeds: [embed] });

        // Notifier le parrain (optionnel)
        try {
            const referrerUser = await interaction.client.users.fetch(referrer.discord_id);
            const notificationEmbed = new EmbedBuilder()
                .setTitle('🎉 Nouveau parrainage !')
                .setColor(config.colors.success)
                .setDescription(`${interaction.user.tag} a utilisé votre code de parrainage !`)
                .addFields({
                    name: '💰 Récompense',
                    value: `**${config.credits.referralReward}** crédits ajoutés à votre compte`,
                    inline: false
                })
                .setTimestamp();

            await referrerUser.send({ embeds: [notificationEmbed] });
        } catch (error) {
            console.log('Impossible de notifier le parrain:', error.message);
        }

    } catch (error) {
        // Annuler la transaction en cas d'erreur
        await query('ROLLBACK');
        console.error('Erreur lors du parrainage:', error);
        await interaction.editReply({ content: '❌ Une erreur est survenue lors du traitement du parrainage.' });
    }
}

async function handleStatsSubcommand(interaction, user) {
    // Récupérer les statistiques de parrainage
    const referralsResult = await query(
        'SELECT COUNT(*) as total_referrals FROM users WHERE referred_by = ?',
        [interaction.user.id]
    );

    const rewardsResult = await query(
        'SELECT SUM(reward_amount) as total_rewards FROM referral_rewards WHERE referrer_id = ?',
        [interaction.user.id]
    );

    const recentReferralsResult = await query(
        'SELECT u.discord_id, rr.reward_amount, rr.created_at FROM referral_rewards rr JOIN users u ON rr.referred_id = u.discord_id WHERE rr.referrer_id = ? ORDER BY rr.created_at DESC LIMIT 5',
        [interaction.user.id]
    );

    const totalReferrals = referralsResult[0]?.total_referrals || 0;
    const totalRewards = rewardsResult[0]?.total_rewards || 0;

    const embed = new EmbedBuilder()
        .setTitle('📊 Vos statistiques de parrainage')
        .setColor(config.colors.info)
        .setThumbnail(interaction.user.displayAvatarURL())
        .addFields(
            {
                name: '🔗 Votre code',
                value: `\`${user.referral_code}\``,
                inline: true
            },
            {
                name: '👥 Parrainages totaux',
                value: `**${totalReferrals}**`,
                inline: true
            },
            {
                name: '💰 Crédits gagnés',
                value: `**${totalRewards}**`,
                inline: true
            }
        )
        .setTimestamp()
        .setFooter({ text: 'MenMuse Bot', iconURL: interaction.client.user.displayAvatarURL() });

    // Ajouter les parrainages récents
    if (recentReferralsResult.length > 0) {
        const recentList = recentReferralsResult.map(r => {
            const date = new Date(r.created_at);
            return `<@${r.discord_id}> - ${r.reward_amount} crédits (<t:${Math.floor(date.getTime() / 1000)}:R>)`;
        }).join('\n');

        embed.addFields({
            name: '🕒 Parrainages récents',
            value: recentList,
            inline: false
        });
    }

    // Informations sur qui l'a parrainé
    if (user.referred_by) {
        embed.addFields({
            name: '👤 Parrainé par',
            value: `<@${user.referred_by}>`,
            inline: false
        });
    }

    // Conseils
    embed.addFields({
        name: '💡 Conseil',
        value: `Partagez votre code \`${user.referral_code}\` avec vos amis pour gagner **${config.credits.referralReward}** crédits par parrainage !`,
        inline: false
    });

    await interaction.editReply({ embeds: [embed] });
}