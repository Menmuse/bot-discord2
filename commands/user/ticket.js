const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, MessageFlags } = require('discord.js');
const { query } = require('../../config/database');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Gestion des tickets de support')
        .addSubcommand(subcommand =>
            subcommand
                .setName('ouvrir')
                .setDescription('Ouvre un nouveau ticket de support')
                .addStringOption(option =>
                    option.setName('type')
                        .setDescription('Type de ticket')
                        .setRequired(true)
                        .addChoices(
                            { name: '🆘 Assistance générale', value: 'assistance' },
                            { name: '📦 Commande fournisseur', value: 'commande' },
                            { name: '⚖️ Litige', value: 'litige' },
                            { name: '❓ Autre', value: 'autre' }
                        )
                )
                .addStringOption(option =>
                    option.setName('sujet')
                        .setDescription('Sujet du ticket (optionnel)')
                        .setRequired(false)
                        .setMaxLength(100)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('fermer')
                .setDescription('Ferme le ticket actuel')
                .addStringOption(option =>
                    option.setName('raison')
                        .setDescription('Raison de la fermeture (optionnel)')
                        .setRequired(false)
                        .setMaxLength(200)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('liste')
                .setDescription('Liste vos tickets')
        ),
    
    cooldown: 10,

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
                case 'ouvrir':
                    await handleOuvrirSubcommand(interaction, user);
                    break;
                case 'fermer':
                    await handleFermerSubcommand(interaction, user);
                    break;
                case 'liste':
                    await handleListeSubcommand(interaction, user);
                    break;
            }

        } catch (error) {
            console.error('Erreur lors de l\'exécution de la commande ticket:', error);
            
            const errorMessage = '❌ Une erreur est survenue lors du traitement de votre demande.';
            
            if (interaction.deferred) {
                await interaction.editReply({ content: errorMessage });
            } else {
                await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
            }
        }
    },
};

async function handleOuvrirSubcommand(interaction, user) {
    const type = interaction.options.getString('type');
    const sujet = interaction.options.getString('sujet') || 'Aucun sujet spécifié';

    // Vérifier si l'utilisateur a déjà un ticket ouvert
    const existingTicketResult = await query(
        'SELECT * FROM tickets WHERE user_id = ? AND status = "open"',
        [interaction.user.id]
    );

    if (existingTicketResult.length > 0) {
        const existingTicket = existingTicketResult[0];
        return interaction.editReply({ 
            content: `❌ Vous avez déjà un ticket ouvert: <#${existingTicket.channel_id}>` 
        });
    }

    try {
        // Créer le channel de ticket
        const ticketChannel = await interaction.guild.channels.create({
            name: `ticket-${interaction.user.username}-${Date.now().toString().slice(-4)}`,
            type: ChannelType.GuildText,
            parent: config.channels.tickets, // Catégorie des tickets (si configurée)
            permissionOverwrites: [
                {
                    id: interaction.guild.id,
                    deny: [PermissionFlagsBits.ViewChannel],
                },
                {
                    id: interaction.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.AttachFiles
                    ],
                },
                // Ajouter les permissions pour le rôle staff si configuré
                ...(config.roles.staff && interaction.guild.roles.cache.has(config.roles.staff) ? [{
                    id: config.roles.staff,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.ReadMessageHistory,
                        PermissionFlagsBits.AttachFiles,
                        PermissionFlagsBits.ManageMessages
                    ],
                }] : [])
            ],
        });

        // Enregistrer le ticket dans la base de données
        await query(
            'INSERT INTO tickets (user_id, channel_id, type, subject, status) VALUES (?, ?, ?, ?, ?)',
            [interaction.user.id, ticketChannel.id, type, sujet, 'open']
        );

        // Créer l'embed de bienvenue
        const welcomeEmbed = new EmbedBuilder()
            .setTitle('🎫 Ticket de support créé')
            .setColor(config.colors.info)
            .setDescription('Bienvenue dans votre ticket de support !')
            .addFields(
                {
                    name: '👤 Utilisateur',
                    value: `${interaction.user.tag} (${interaction.user.id})`,
                    inline: true
                },
                {
                    name: '📋 Type',
                    value: getTypeDisplay(type),
                    inline: true
                },
                {
                    name: '📝 Sujet',
                    value: sujet,
                    inline: false
                },
                {
                    name: '📅 Créé le',
                    value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                    inline: true
                },
                {
                    name: '💡 Instructions',
                    value: 'Décrivez votre problème en détail. Un membre du staff vous répondra bientôt.\n\nPour fermer ce ticket, utilisez `/ticket fermer`',
                    inline: false
                }
            )
            .setTimestamp()
            .setFooter({ text: 'MenMuse Bot', iconURL: interaction.client.user.displayAvatarURL() });

        // Bouton pour fermer le ticket
        const closeButton = new ButtonBuilder()
            .setCustomId(`ticket_close_${ticketChannel.id}`)
            .setLabel('Fermer le ticket')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔒');

        const row = new ActionRowBuilder().addComponents(closeButton);

        // Envoyer le message de bienvenue dans le ticket
        await ticketChannel.send({
            content: `${interaction.user} Votre ticket a été créé !`,
            embeds: [welcomeEmbed],
            components: [row]
        });

        // Notifier les staff si configuré
        if (config.roles.staff && interaction.guild.roles.cache.has(config.roles.staff)) {
            await ticketChannel.send({
                content: `<@&${config.roles.staff}> Nouveau ticket de support !`,
                allowedMentions: { roles: [config.roles.staff] }
            });
        }

        // Répondre à l'utilisateur
        await interaction.editReply({
            content: `✅ Ticket créé avec succès ! Rendez-vous dans ${ticketChannel} pour continuer.`
        });

        // Logger l'action
        await query(
            'INSERT INTO usage_logs (user_id, action, command_name, details) VALUES (?, ?, ?, ?)',
            [interaction.user.id, 'ticket_created', 'ticket', `Type: ${type}, Sujet: ${sujet}`]
        );

    } catch (error) {
        console.error('Erreur lors de la création du ticket:', error);
        await interaction.editReply({ content: '❌ Erreur lors de la création du ticket.' });
    }
}

async function handleFermerSubcommand(interaction, user) {
    const raison = interaction.options.getString('raison') || 'Aucune raison spécifiée';

    // Vérifier si nous sommes dans un channel de ticket
    const ticketResult = await query(
        'SELECT * FROM tickets WHERE channel_id = ? AND status = "open"',
        [interaction.channel.id]
    );

    if (ticketResult.length === 0) {
        return interaction.editReply({ 
            content: '❌ Cette commande ne peut être utilisée que dans un ticket ouvert.' 
        });
    }

    const ticket = ticketResult[0];

    // Vérifier les permissions (propriétaire du ticket ou staff)
    const isOwner = ticket.user_id === interaction.user.id;
    const isStaff = user.status === 'staff' || (config.roles.staff && interaction.member.roles.cache.has(config.roles.staff));

    if (!isOwner && !isStaff) {
        return interaction.editReply({ 
            content: '❌ Vous ne pouvez fermer que vos propres tickets.' 
        });
    }

    try {
        // Mettre à jour le ticket dans la base de données
        await query(
            'UPDATE tickets SET status = "closed", closed_at = NOW() WHERE id = ?',
            [ticket.id]
        );

        // Créer l'embed de fermeture
        const closeEmbed = new EmbedBuilder()
            .setTitle('🔒 Ticket fermé')
            .setColor(config.colors.warning)
            .addFields(
                {
                    name: '👤 Fermé par',
                    value: `${interaction.user.tag}`,
                    inline: true
                },
                {
                    name: '📅 Fermé le',
                    value: `<t:${Math.floor(Date.now() / 1000)}:F>`,
                    inline: true
                },
                {
                    name: '📝 Raison',
                    value: raison,
                    inline: false
                }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [closeEmbed] });

        // Attendre un peu puis supprimer le channel
        setTimeout(async () => {
            try {
                await interaction.channel.delete('Ticket fermé');
            } catch (error) {
                console.error('Erreur lors de la suppression du channel:', error);
            }
        }, 10000); // 10 secondes

        // Logger l'action
        await query(
            'INSERT INTO usage_logs (user_id, action, command_name, details) VALUES (?, ?, ?, ?)',
            [interaction.user.id, 'ticket_closed', 'ticket', `Raison: ${raison}`]
        );

    } catch (error) {
        console.error('Erreur lors de la fermeture du ticket:', error);
        await interaction.editReply({ content: '❌ Erreur lors de la fermeture du ticket.' });
    }
}

async function handleListeSubcommand(interaction, user) {
    // Récupérer les tickets de l'utilisateur
    const ticketsResult = await query(
        'SELECT * FROM tickets WHERE user_id = ? ORDER BY created_at DESC LIMIT 10',
        [interaction.user.id]
    );

    const embed = new EmbedBuilder()
        .setTitle('🎫 Vos tickets')
        .setColor(config.colors.info)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setTimestamp()
        .setFooter({ text: 'MenMuse Bot', iconURL: interaction.client.user.displayAvatarURL() });

    if (ticketsResult.length === 0) {
        embed.setDescription('Vous n\'avez aucun ticket.');
    } else {
        const ticketsList = ticketsResult.map(ticket => {
            const createdDate = new Date(ticket.created_at);
            const statusEmoji = ticket.status === 'open' ? '🟢' : '🔴';
            const channelMention = ticket.status === 'open' ? `<#${ticket.channel_id}>` : `~~#${ticket.channel_id}~~`;
            
            let ticketInfo = `${statusEmoji} **${getTypeDisplay(ticket.type)}**\n`;
            ticketInfo += `📝 ${ticket.subject || 'Aucun sujet'}\n`;
            ticketInfo += `📅 <t:${Math.floor(createdDate.getTime() / 1000)}:R>\n`;
            
            if (ticket.status === 'open') {
                ticketInfo += `📍 ${channelMention}`;
            } else {
                const closedDate = new Date(ticket.closed_at);
                ticketInfo += `🔒 Fermé <t:${Math.floor(closedDate.getTime() / 1000)}:R>`;
            }
            
            return ticketInfo;
        }).join('\n\n');

        embed.setDescription(ticketsList);
    }

    // Ajouter des statistiques
    const openTickets = ticketsResult.filter(t => t.status === 'open').length;
    const closedTickets = ticketsResult.filter(t => t.status === 'closed').length;

    embed.addFields({
        name: '📊 Statistiques',
        value: `🟢 Ouverts: **${openTickets}**\n🔴 Fermés: **${closedTickets}**`,
        inline: true
    });

    await interaction.editReply({ embeds: [embed] });
}

function getTypeDisplay(type) {
    switch (type) {
        case 'assistance':
            return '🆘 Assistance générale';
        case 'commande':
            return '📦 Commande fournisseur';
        case 'litige':
            return '⚖️ Litige';
        case 'autre':
            return '❓ Autre';
        default:
            return '❓ Inconnu';
    }
}