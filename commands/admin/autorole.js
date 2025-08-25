const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../../config');
const { getMessage } = require('../../config/messages');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('autorole')
        .setDescription('Gestion des autorôles et sélection de langue')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Configure le système d\'autorôles')
                .addChannelOption(option =>
                    option.setName('canal')
                        .setDescription('Canal où envoyer le message d\'autorôles')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('language')
                .setDescription('Envoie le sélecteur de langue')
                .addChannelOption(option =>
                    option.setName('canal')
                        .setDescription('Canal où envoyer le sélecteur de langue')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('roles')
                .setDescription('Envoie le sélecteur de rôles')
                .addChannelOption(option =>
                    option.setName('canal')
                        .setDescription('Canal où envoyer le sélecteur de rôles')
                        .setRequired(true)
                )
        ),
    
    cooldown: 5,

    async execute(interaction) {
        // Vérifier les permissions
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles) && 
            interaction.user.id !== config.ownerId) {
            return interaction.reply({ 
                content: '❌ Vous n\'avez pas les permissions pour utiliser cette commande.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const channel = interaction.options.getChannel('canal');

        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            switch (subcommand) {
                case 'setup':
                    await handleSetup(interaction, channel);
                    break;
                case 'language':
                    await handleLanguage(interaction, channel);
                    break;
                case 'roles':
                    await handleRoles(interaction, channel);
                    break;
            }

        } catch (error) {
            console.error('Erreur lors de l\'exécution de la commande autorole:', error);
            
            const errorMessage = '❌ Une erreur est survenue lors du traitement de votre demande.';
            
            if (interaction.deferred) {
                await interaction.editReply({ content: errorMessage });
            } else {
                await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
            }
        }
    },
};

async function handleSetup(interaction, channel) {
    // Envoyer les deux messages: langue et rôles
    await handleLanguage(interaction, channel, false);
    await handleRoles(interaction, channel, false);
    
    await interaction.editReply({ 
        content: `✅ Système d'autorôles configuré dans ${channel} !` 
    });
}

async function handleLanguage(interaction, channel, reply = true) {
    // Créer l'embed pour la sélection de langue
    const languageEmbed = new EmbedBuilder()
        .setTitle('🌍 Sélection de langue / Language Selection')
        .setColor(config.colors.info)
        .setDescription(
            '**Français:** Choisissez votre langue préférée pour recevoir les messages du bot dans votre langue.\n\n' +
            '**English:** Choose your preferred language to receive bot messages in your language.'
        )
        .addFields(
            {
                name: '🇫🇷 Français',
                value: 'Langue par défaut du bot',
                inline: true
            },
            {
                name: '🇬🇧 English',
                value: 'Default bot language',
                inline: true
            }
        )
        .setFooter({ 
            text: 'Cliquez sur un bouton pour sélectionner votre langue • Click a button to select your language', 
            iconURL: interaction.client.user.displayAvatarURL() 
        })
        .setTimestamp();

    // Créer les boutons de langue
    const languageButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('language_fr')
                .setLabel('Français')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🇫🇷'),
            new ButtonBuilder()
                .setCustomId('language_en')
                .setLabel('English')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🇬🇧')
        );

    // Envoyer le message dans le canal
    await channel.send({
        embeds: [languageEmbed],
        components: [languageButtons]
    });

    if (reply) {
        await interaction.editReply({ 
            content: `✅ Sélecteur de langue envoyé dans ${channel} !` 
        });
    }
}

async function handleRoles(interaction, channel, reply = true) {
    // Créer l'embed pour la sélection de rôles
    const rolesEmbed = new EmbedBuilder()
        .setTitle('🎭 Sélection de rôles')
        .setColor(config.colors.secondary)
        .setDescription(
            'Choisissez vos rôles pour personnaliser votre expérience sur le serveur !\n\n' +
            '**Rôles disponibles:**\n' +
            '🔔 **Notifications** - Recevez les annonces importantes'
        )
        .addFields(
            {
                name: '📋 Instructions',
                value: 'Cliquez sur les boutons ci-dessous pour ajouter ou retirer les rôles correspondants.',
                inline: false
            },
            {
                name: '⚠️ Note',
                value: 'Vous pouvez sélectionner plusieurs rôles. Cliquez à nouveau sur un bouton pour retirer le rôle.',
                inline: false
            }
        )
        .setFooter({ 
            text: 'MenMuse Bot • Système d\'autorôles', 
            iconURL: interaction.client.user.displayAvatarURL() 
        })
        .setTimestamp();

    // Créer les boutons de rôles
    const rolesButtons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`role_${config.roles.notifications || 'notifications'}`)
                .setLabel('Notifications')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🔔')
        );

    // Envoyer le message dans le canal
    await channel.send({
        embeds: [rolesEmbed],
        components: [rolesButtons]
    });

    if (reply) {
        await interaction.editReply({ 
            content: `✅ Sélecteur de rôles envoyé dans ${channel} !` 
        });
    }
}