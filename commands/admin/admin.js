const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { query } = require('../../config/database');
const config = require('../../config');
const { getMessage } = require('../../config/messages');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Commandes administratives')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommandGroup(group =>
            group
                .setName('user')
                .setDescription('Gestion des utilisateurs')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('info')
                        .setDescription('Affiche les informations d\'un utilisateur')
                        .addUserOption(option =>
                            option.setName('utilisateur')
                                .setDescription('L\'utilisateur à consulter')
                                .setRequired(true)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('status')
                        .setDescription('Modifie le statut d\'un utilisateur')
                        .addUserOption(option =>
                            option.setName('utilisateur')
                                .setDescription('L\'utilisateur à modifier')
                                .setRequired(true)
                        )
                        .addStringOption(option =>
                            option.setName('statut')
                                .setDescription('Nouveau statut')
                                .setRequired(true)
                                .addChoices(
                                    { name: '🆓 Gratuit', value: 'gratuit' },
                                    { name: '⭐ Premium', value: 'premium' },
                                    { name: '👑 Staff', value: 'staff' },
                                    { name: '🚫 Banni', value: 'banni' }
                                )
                        )
                        .addIntegerOption(option =>
                            option.setName('duree')
                                .setDescription('Durée en jours (pour premium/ban, 0 = permanent)')
                                .setRequired(false)
                                .setMinValue(0)
                                .setMaxValue(365)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('credits')
                        .setDescription('Modifie les crédits d\'un utilisateur')
                        .addUserOption(option =>
                            option.setName('utilisateur')
                                .setDescription('L\'utilisateur à modifier')
                                .setRequired(true)
                        )
                        .addStringOption(option =>
                            option.setName('action')
                                .setDescription('Action à effectuer')
                                .setRequired(true)
                                .addChoices(
                                    { name: '➕ Ajouter', value: 'add' },
                                    { name: '➖ Retirer', value: 'remove' },
                                    { name: '🔄 Définir', value: 'set' }
                                )
                        )
                        .addIntegerOption(option =>
                            option.setName('montant')
                                .setDescription('Montant de crédits')
                                .setRequired(true)
                                .setMinValue(1)
                                .setMaxValue(10000)
                        )
                        .addStringOption(option =>
                            option.setName('raison')
                                .setDescription('Raison de la modification')
                                .setRequired(false)
                                .setMaxLength(200)
                        )
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('reset')
                        .setDescription('Remet à zéro les données d\'un utilisateur')
                        .addUserOption(option =>
                            option.setName('utilisateur')
                                .setDescription('L\'utilisateur à réinitialiser')
                                .setRequired(true)
                        )
                        .addBooleanOption(option =>
                            option.setName('confirmation')
                                .setDescription('Confirmer la réinitialisation (IRRÉVERSIBLE)')
                                .setRequired(true)
                        )
                )
        )
        .addSubcommandGroup(group =>
            group
                .setName('stats')
                .setDescription('Statistiques du bot')
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('general')
                        .setDescription('Statistiques générales du bot')
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('users')
                        .setDescription('Statistiques des utilisateurs')
                )
                .addSubcommand(subcommand =>
                    subcommand
                        .setName('usage')
                        .setDescription('Statistiques d\'utilisation')
                        .addStringOption(option =>
                            option.setName('periode')
                                .setDescription('Période à analyser')
                                .setRequired(false)
                                .addChoices(
                                    { name: '📅 Aujourd\'hui', value: 'today' },
                                    { name: '📆 Cette semaine', value: 'week' },
                                    { name: '📊 Ce mois', value: 'month' },
                                    { name: '📈 Tout', value: 'all' }
                                )
                        )
                )
        ),
    
    cooldown: 5,

    async execute(interaction) {
        // Vérifier les permissions
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && 
            interaction.user.id !== config.ownerId) {
            return interaction.reply({ 
                content: '❌ Vous n\'avez pas les permissions pour utiliser cette commande.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        const group = interaction.options.getSubcommandGroup();
        const subcommand = interaction.options.getSubcommand();

        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            if (group === 'user') {
                switch (subcommand) {
                    case 'info':
                        await handleUserInfo(interaction);
                        break;
                    case 'status':
                        await handleUserStatus(interaction);
                        break;
                    case 'credits':
                        await handleUserCredits(interaction);
                        break;
                    case 'reset':
                        await handleUserReset(interaction);
                        break;
                }
            } else if (group === 'stats') {
                switch (subcommand) {
                    case 'general':
                        await handleStatsGeneral(interaction);
                        break;
                    case 'users':
                        await handleStatsUsers(interaction);
                        break;
                    case 'usage':
                        await handleStatsUsage(interaction);
                        break;
                }
            }

        } catch (error) {
            console.error('Erreur lors de l\'exécution de la commande admin:', error);
            
            const errorMessage = '❌ Une erreur est survenue lors du traitement de votre demande.';
            
            if (interaction.deferred) {
                await interaction.editReply({ content: errorMessage });
            } else {
                await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
            }
        }
    },
};

async function handleUserInfo(interaction) {
    const targetUser = interaction.options.getUser('utilisateur');
    
    // Récupérer les données de l'utilisateur
    const userResult = await query('SELECT * FROM users WHERE discord_id = ?', [targetUser.id]);
    
    if (userResult.length === 0) {
        return interaction.editReply({ content: '❌ Utilisateur non trouvé dans la base de données.' });
    }
    
    const user = userResult[0];
    
    // Récupérer les statistiques d'utilisation
    const usageResult = await query(
        'SELECT COUNT(*) as total_actions, SUM(CASE WHEN action = "pdf_generated" THEN 1 ELSE 0 END) as pdf_count FROM usage_logs WHERE user_id = ?',
        [targetUser.id]
    );
    
    const usage = usageResult[0];
    
    // Récupérer les transactions récentes
    const transactionsResult = await query(
        'SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC LIMIT 5',
        [targetUser.id]
    );
    
    // Récupérer les statistiques de parrainage
    const referralResult = await query(
        'SELECT COUNT(*) as total_referrals, SUM(reward_amount) as total_credits_earned FROM referral_rewards WHERE referrer_id = ?',
        [targetUser.id]
    );
    
    const referral = referralResult[0];
    
    // Créer l'embed
    const embed = new EmbedBuilder()
        .setTitle(`👤 Informations utilisateur: ${targetUser.tag}`)
        .setColor(config.colors.info)
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields(
            {
                name: '🆔 Identifiants',
                value: `**Discord ID:** ${targetUser.id}\n**DB ID:** ${user.id}\n**Code parrainage:** ${user.referral_code}`,
                inline: true
            },
            {
                name: '💰 Crédits',
                value: `**Solde:** ${user.credits}\n**Dépensés:** ${user.credits_spent || 0}`,
                inline: true
            },
            {
                name: '📊 Statut',
                value: `**Statut:** ${getStatusDisplay(user.status)}\n**Langue:** ${user.language || 'fr'}`,
                inline: true
            },
            {
                name: '📅 Dates importantes',
                value: `**Inscription:** <t:${Math.floor(new Date(user.created_at).getTime() / 1000)}:F>\n**Dernière activité:** <t:${Math.floor(new Date(user.updated_at).getTime() / 1000)}:R>\n**Premium jusqu'au:** ${user.premium_until ? `<t:${Math.floor(new Date(user.premium_until).getTime() / 1000)}:F>` : 'N/A'}`,
                inline: false
            },
            {
                name: '📈 Statistiques d\'utilisation',
                value: `**Actions totales:** ${usage.total_actions || 0}\n**PDF générés:** ${usage.pdf_count || 0}`,
                inline: true
            },
            {
                name: '🤝 Parrainage',
                value: `**Parrainages:** ${referral.total_referrals || 0}\n**Crédits gagnés:** ${referral.total_credits_earned || 0}`,
                inline: true
            }
        )
        .setTimestamp()
        .setFooter({ text: `Demandé par ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() });
    
    // Ajouter les transactions récentes si il y en a
    if (transactionsResult.length > 0) {
        const transactionsList = transactionsResult.map(t => {
            const date = new Date(t.created_at);
            const sign = t.amount > 0 ? '+' : '';
            return `${sign}${t.amount} - ${t.description} (<t:${Math.floor(date.getTime() / 1000)}:R>)`;
        }).join('\n');
        
        embed.addFields({
            name: '💳 Transactions récentes',
            value: transactionsList,
            inline: false
        });
    }
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleUserStatus(interaction) {
    const targetUser = interaction.options.getUser('utilisateur');
    const newStatus = interaction.options.getString('statut');
    const duration = interaction.options.getInteger('duree');
    
    // Récupérer l'utilisateur
    const userResult = await query('SELECT * FROM users WHERE discord_id = ?', [targetUser.id]);
    
    if (userResult.length === 0) {
        return interaction.editReply({ content: '❌ Utilisateur non trouvé dans la base de données.' });
    }
    
    const user = userResult[0];
    
    // Calculer la date d'expiration si nécessaire
    let premiumUntil = null;
    if (newStatus === 'premium' && duration && duration > 0) {
        const expirationDate = new Date();
        expirationDate.setDate(expirationDate.getDate() + duration);
        premiumUntil = expirationDate;
    }
    
    // Mettre à jour le statut
    await query(
        'UPDATE users SET status = ?, premium_until = ?, updated_at = NOW() WHERE discord_id = ?',
        [newStatus, premiumUntil, targetUser.id]
    );
    
    // Créer une transaction pour tracer le changement
    const description = `Statut modifié: ${user.status} → ${newStatus} par ${interaction.user.tag}`;
    await query(
        'INSERT INTO transactions (user_id, amount, description, type) VALUES (?, ?, ?, ?)',
        [targetUser.id, 0, description, 'admin']
    );
    
    // Logger l'action
    await query(
        'INSERT INTO usage_logs (user_id, action, command_name, details) VALUES (?, ?, ?, ?)',
        [interaction.user.id, 'admin_status_change', 'admin', `Target: ${targetUser.id}, New status: ${newStatus}`]
    );
    
    const embed = new EmbedBuilder()
        .setTitle('✅ Statut utilisateur modifié')
        .setColor(config.colors.success)
        .addFields(
            {
                name: '👤 Utilisateur',
                value: `${targetUser.tag} (${targetUser.id})`,
                inline: true
            },
            {
                name: '📊 Nouveau statut',
                value: getStatusDisplay(newStatus),
                inline: true
            },
            {
                name: '⏰ Expiration',
                value: premiumUntil ? `<t:${Math.floor(premiumUntil.getTime() / 1000)}:F>` : 'N/A',
                inline: true
            }
        )
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleUserCredits(interaction) {
    const targetUser = interaction.options.getUser('utilisateur');
    const action = interaction.options.getString('action');
    const amount = interaction.options.getInteger('montant');
    const reason = interaction.options.getString('raison') || 'Modification administrative';
    
    // Récupérer l'utilisateur
    const userResult = await query('SELECT * FROM users WHERE discord_id = ?', [targetUser.id]);
    
    if (userResult.length === 0) {
        return interaction.editReply({ content: '❌ Utilisateur non trouvé dans la base de données.' });
    }
    
    const user = userResult[0];
    let newCredits;
    let transactionAmount;
    
    switch (action) {
        case 'add':
            newCredits = user.credits + amount;
            transactionAmount = amount;
            break;
        case 'remove':
            newCredits = Math.max(0, user.credits - amount);
            transactionAmount = -amount;
            break;
        case 'set':
            newCredits = amount;
            transactionAmount = amount - user.credits;
            break;
    }
    
    // Mettre à jour les crédits
    await query(
        'UPDATE users SET credits = ?, updated_at = NOW() WHERE discord_id = ?',
        [newCredits, targetUser.id]
    );
    
    // Créer une transaction
    await query(
        'INSERT INTO transactions (user_id, amount, description, type) VALUES (?, ?, ?, ?)',
        [targetUser.id, transactionAmount, `${reason} (par ${interaction.user.tag})`, 'admin']
    );
    
    // Logger l'action
    await query(
        'INSERT INTO usage_logs (user_id, action, command_name, details) VALUES (?, ?, ?, ?)',
        [interaction.user.id, 'admin_credits_change', 'admin', `Target: ${targetUser.id}, Action: ${action}, Amount: ${amount}`]
    );
    
    const embed = new EmbedBuilder()
        .setTitle('✅ Crédits modifiés')
        .setColor(config.colors.success)
        .addFields(
            {
                name: '👤 Utilisateur',
                value: `${targetUser.tag} (${targetUser.id})`,
                inline: true
            },
            {
                name: '💰 Modification',
                value: `${user.credits} → **${newCredits}** (${transactionAmount >= 0 ? '+' : ''}${transactionAmount})`,
                inline: true
            },
            {
                name: '📝 Raison',
                value: reason,
                inline: false
            }
        )
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleUserReset(interaction) {
    const targetUser = interaction.options.getUser('utilisateur');
    const confirmation = interaction.options.getBoolean('confirmation');
    
    if (!confirmation) {
        return interaction.editReply({ content: '❌ Vous devez confirmer la réinitialisation en définissant le paramètre `confirmation` sur `true`.' });
    }
    
    // Récupérer l'utilisateur
    const userResult = await query('SELECT * FROM users WHERE discord_id = ?', [targetUser.id]);
    
    if (userResult.length === 0) {
        return interaction.editReply({ content: '❌ Utilisateur non trouvé dans la base de données.' });
    }
    
    // Réinitialiser l'utilisateur
    await query(
        'UPDATE users SET credits = 0, credits_spent = 0, status = "gratuit", premium_until = NULL, updated_at = NOW() WHERE discord_id = ?',
        [targetUser.id]
    );
    
    // Supprimer les données associées
    await query('DELETE FROM transactions WHERE user_id = ?', [targetUser.id]);
    await query('DELETE FROM usage_logs WHERE user_id = ?', [targetUser.id]);
    await query('DELETE FROM referral_rewards WHERE referrer_id = ? OR referred_id = ?', [targetUser.id, targetUser.id]);
    
    // Logger l'action
    await query(
        'INSERT INTO usage_logs (user_id, action, command_name, details) VALUES (?, ?, ?, ?)',
        [interaction.user.id, 'admin_user_reset', 'admin', `Target: ${targetUser.id}`]
    );
    
    const embed = new EmbedBuilder()
        .setTitle('✅ Utilisateur réinitialisé')
        .setColor(config.colors.warning)
        .setDescription(`L'utilisateur ${targetUser.tag} a été complètement réinitialisé.`)
        .addFields({
            name: '🗑️ Données supprimées',
            value: '• Crédits remis à 0\n• Statut remis à gratuit\n• Transactions supprimées\n• Logs d\'utilisation supprimés\n• Données de parrainage supprimées',
            inline: false
        })
        .setTimestamp();
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleStatsGeneral(interaction) {
    // Statistiques générales
    const userStatsResult = await query(
        'SELECT COUNT(*) as total_users, SUM(CASE WHEN status = "premium" THEN 1 ELSE 0 END) as premium_users, SUM(CASE WHEN status = "staff" THEN 1 ELSE 0 END) as staff_users, SUM(CASE WHEN status = "banni" THEN 1 ELSE 0 END) as banned_users FROM users'
    );
    
    const creditStatsResult = await query(
        'SELECT SUM(credits) as total_credits, AVG(credits) as avg_credits FROM users'
    );
    
    const transactionStatsResult = await query(
        'SELECT COUNT(*) as total_transactions, SUM(amount) as total_amount FROM transactions'
    );
    
    const usageStatsResult = await query(
        'SELECT COUNT(*) as total_actions, COUNT(DISTINCT user_id) as active_users FROM usage_logs WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)'
    );
    
    const userStats = userStatsResult[0];
    const creditStats = creditStatsResult[0];
    const transactionStats = transactionStatsResult[0];
    const usageStats = usageStatsResult[0];
    
    const embed = new EmbedBuilder()
        .setTitle('📊 Statistiques générales du bot')
        .setColor(config.colors.info)
        .addFields(
            {
                name: '👥 Utilisateurs',
                value: `**Total:** ${userStats.total_users}\n**Premium:** ${userStats.premium_users}\n**Staff:** ${userStats.staff_users}\n**Bannis:** ${userStats.banned_users}`,
                inline: true
            },
            {
                name: '💰 Crédits',
                value: `**Total en circulation:** ${creditStats.total_credits || 0}\n**Moyenne par utilisateur:** ${Math.round(creditStats.avg_credits || 0)}`,
                inline: true
            },
            {
                name: '💳 Transactions',
                value: `**Total:** ${transactionStats.total_transactions || 0}\n**Volume:** ${transactionStats.total_amount || 0}`,
                inline: true
            },
            {
                name: '📈 Activité (30 derniers jours)',
                value: `**Actions totales:** ${usageStats.total_actions || 0}\n**Utilisateurs actifs:** ${usageStats.active_users || 0}`,
                inline: true
            },
            {
                name: '🤖 Bot',
                value: `**Serveurs:** ${interaction.client.guilds.cache.size}\n**Utilisateurs Discord:** ${interaction.client.users.cache.size}\n**Uptime:** <t:${Math.floor((Date.now() - interaction.client.uptime) / 1000)}:R>`,
                inline: true
            }
        )
        .setTimestamp()
        .setFooter({ text: 'MenMuse Bot', iconURL: interaction.client.user.displayAvatarURL() });
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleStatsUsers(interaction) {
    // Top utilisateurs par crédits
    const topCreditsResult = await query(
        'SELECT discord_id, credits FROM users ORDER BY credits DESC LIMIT 10'
    );
    
    // Top utilisateurs par activité
    const topActivityResult = await query(
        'SELECT user_id, COUNT(*) as actions FROM usage_logs GROUP BY user_id ORDER BY actions DESC LIMIT 10'
    );
    
    // Top parrains
    const topReferrersResult = await query(
        'SELECT referrer_id, COUNT(*) as referrals, SUM(reward_amount) as total_earned FROM referral_rewards GROUP BY referrer_id ORDER BY referrals DESC LIMIT 10'
    );
    
    const embed = new EmbedBuilder()
        .setTitle('👥 Statistiques des utilisateurs')
        .setColor(config.colors.info)
        .setTimestamp();
    
    // Top crédits
    if (topCreditsResult.length > 0) {
        const creditsList = await Promise.all(topCreditsResult.map(async (user, index) => {
            try {
                const discordUser = await interaction.client.users.fetch(user.discord_id);
                return `${index + 1}. ${discordUser.tag}: **${user.credits}** crédits`;
            } catch {
                return `${index + 1}. Utilisateur inconnu: **${user.credits}** crédits`;
            }
        }));
        
        embed.addFields({
            name: '💰 Top crédits',
            value: creditsList.join('\n'),
            inline: false
        });
    }
    
    // Top activité
    if (topActivityResult.length > 0) {
        const activityList = await Promise.all(topActivityResult.map(async (user, index) => {
            try {
                const discordUser = await interaction.client.users.fetch(user.user_id);
                return `${index + 1}. ${discordUser.tag}: **${user.actions}** actions`;
            } catch {
                return `${index + 1}. Utilisateur inconnu: **${user.actions}** actions`;
            }
        }));
        
        embed.addFields({
            name: '📈 Top activité',
            value: activityList.join('\n'),
            inline: false
        });
    }
    
    // Top parrains
    if (topReferrersResult.length > 0) {
        const referrersList = await Promise.all(topReferrersResult.map(async (user, index) => {
            try {
                const discordUser = await interaction.client.users.fetch(user.referrer_id);
                return `${index + 1}. ${discordUser.tag}: **${user.referrals}** parrainages (${user.total_earned} crédits)`;
            } catch {
                return `${index + 1}. Utilisateur inconnu: **${user.referrals}** parrainages (${user.total_earned} crédits)`;
            }
        }));
        
        embed.addFields({
            name: '🤝 Top parrains',
            value: referrersList.join('\n'),
            inline: false
        });
    }
    
    await interaction.editReply({ embeds: [embed] });
}

async function handleStatsUsage(interaction) {
    const period = interaction.options.getString('periode') || 'week';
    
    let dateFilter = '';
    let periodName = '';
    
    switch (period) {
        case 'today':
            dateFilter = 'WHERE created_at >= CURDATE()';
            periodName = 'aujourd\'hui';
            break;
        case 'week':
            dateFilter = 'WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
            periodName = 'cette semaine';
            break;
        case 'month':
            dateFilter = 'WHERE created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)';
            periodName = 'ce mois';
            break;
        case 'all':
        default:
            dateFilter = '';
            periodName = 'toute la période';
            break;
    }
    
    // Statistiques par action
    const actionStatsResult = await query(
        `SELECT action, COUNT(*) as count FROM usage_logs ${dateFilter} GROUP BY action ORDER BY count DESC`
    );
    
    // Statistiques par jour (pour les 7 derniers jours)
    const dailyStatsResult = await query(
        'SELECT DATE(created_at) as date, COUNT(*) as count FROM usage_logs WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY DATE(created_at) ORDER BY date DESC'
    );
    
    // Utilisateurs les plus actifs pour la période
    const activeUsersResult = await query(
        `SELECT user_id, COUNT(*) as actions FROM usage_logs ${dateFilter} GROUP BY user_id ORDER BY actions DESC LIMIT 5`
    );
    
    const embed = new EmbedBuilder()
        .setTitle(`📊 Statistiques d'utilisation - ${periodName}`)
        .setColor(config.colors.info)
        .setTimestamp();
    
    // Actions par type
    if (actionStatsResult.length > 0) {
        const actionsList = actionStatsResult.map(action => {
            return `**${action.action}:** ${action.count}`;
        }).join('\n');
        
        embed.addFields({
            name: '🎯 Actions par type',
            value: actionsList,
            inline: true
        });
    }
    
    // Activité quotidienne
    if (dailyStatsResult.length > 0) {
        const dailyList = dailyStatsResult.map(day => {
            const date = new Date(day.date);
            return `**${date.toLocaleDateString('fr-FR')}:** ${day.count}`;
        }).join('\n');
        
        embed.addFields({
            name: '📅 Activité des 7 derniers jours',
            value: dailyList,
            inline: true
        });
    }
    
    // Utilisateurs les plus actifs
    if (activeUsersResult.length > 0) {
        const usersList = await Promise.all(activeUsersResult.map(async (user, index) => {
            try {
                const discordUser = await interaction.client.users.fetch(user.user_id);
                return `${index + 1}. ${discordUser.tag}: ${user.actions}`;
            } catch {
                return `${index + 1}. Utilisateur inconnu: ${user.actions}`;
            }
        }));
        
        embed.addFields({
            name: '👑 Utilisateurs les plus actifs',
            value: usersList.join('\n'),
            inline: false
        });
    }
    
    await interaction.editReply({ embeds: [embed] });
}

function getStatusDisplay(status) {
    switch (status) {
        case 'gratuit':
            return '🆓 Gratuit';
        case 'premium':
            return '⭐ Premium';
        case 'staff':
            return '👑 Staff';
        case 'banni':
            return '🚫 Banni';
        default:
            return '❓ Inconnu';
    }
}