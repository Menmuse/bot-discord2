const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const config = require('../../config');
const fs = require('fs');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Configuration complète du serveur')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('server')
                .setDescription('Créer tous les rôles et salons nécessaires pour le serveur')
                .addBooleanOption(option =>
                    option.setName('force')
                        .setDescription('Forcer la création même si des éléments existent déjà')
                        .setRequired(false)
                )
        ),
    
    cooldown: 10,

    async execute(interaction) {
        // Vérifier les permissions
        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator) && 
            interaction.user.id !== config.ownerId) {
            return interaction.reply({ 
                content: '❌ Vous devez être administrateur pour utiliser cette commande.', 
                flags: MessageFlags.Ephemeral 
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const force = interaction.options.getBoolean('force') || false;

        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            if (subcommand === 'server') {
                await setupServer(interaction, force);
            }

        } catch (error) {
            console.error('Erreur lors de la configuration du serveur:', error);
            
            const errorMessage = '❌ Une erreur est survenue lors de la configuration du serveur.';
            
            if (interaction.deferred) {
                await interaction.editReply({ content: errorMessage });
            } else {
                await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
            }
        }
    },
};

async function setupServer(interaction, force) {
    const guild = interaction.guild;
    const setupResults = {
        cleanupResults: null,
        rolesCreated: [],
        channelsCreated: [],
        categoriesCreated: [],
        errors: []
    };

    try {
        // 1. Nettoyer le serveur (supprimer tous les salons et rôles existants)
        setupResults.cleanupResults = await cleanupServer(guild, force);
        
        // 2. Créer les catégories
        const categories = {
            general: '📋 GÉNÉRAL',
            community: '👥 COMMUNAUTÉ',
            support: '🎫 SUPPORT',
            staff: '👑 STAFF'
        };

        for (const [key, name] of Object.entries(categories)) {
            try {
                const existingCategory = guild.channels.cache.find(c => c.name === name && c.type === ChannelType.GuildCategory);
                
                if (!existingCategory || force) {
                    if (existingCategory && force) {
                        await existingCategory.delete();
                    }
                    
                    const category = await guild.channels.create({
                        name: name,
                        type: ChannelType.GuildCategory,
                        position: Object.keys(categories).indexOf(key)
                    });
                    
                    setupResults.categoriesCreated.push(name);
                }
            } catch (error) {
                setupResults.errors.push(`Erreur création catégorie ${name}: ${error.message}`);
            }
        }

        // 3. Créer les rôles
        const rolesToCreate = {
            // Rôles de staff
            staff: {
                name: '👑 Staff',
                color: '#FF6B6B',
                permissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ManageRoles, PermissionFlagsBits.KickMembers],
                hoist: true
            },
            premium: {
                name: '💎 Premium',
                color: '#FFD93D',
                permissions: [],
                hoist: true
            },
            // Rôles de langue
            french: {
                name: '🇫🇷 Français',
                color: '#6BCF7F',
                permissions: [],
                hoist: false
            },
            english: {
                name: '🇬🇧 English',
                color: '#4ECDC4',
                permissions: [],
                hoist: false
            },
            // Rôles d'autorôles
            notifications: {
                name: '🔔 Notifications',
                color: '#95A5A6',
                permissions: [],
                hoist: false
            },
            events: {
                name: '🎉 Événements',
                color: '#E74C3C',
                permissions: [],
                hoist: false
            },
            news: {
                name: '📰 Actualités',
                color: '#3498DB',
                permissions: [],
                hoist: false
            },

        };

        for (const [key, roleData] of Object.entries(rolesToCreate)) {
            try {
                const existingRole = guild.roles.cache.find(r => r.name === roleData.name);
                
                if (!existingRole || force) {
                    if (existingRole && force) {
                        await existingRole.delete();
                    }
                    
                    const role = await guild.roles.create({
                        name: roleData.name,
                        color: roleData.color,
                        permissions: roleData.permissions,
                        hoist: roleData.hoist,
                        mentionable: true
                    });
                    
                    setupResults.rolesCreated.push(roleData.name);
                    
                    // Mettre à jour la config avec l'ID du rôle
                    await updateConfigRole(key, role.id);
                }
            } catch (error) {
                setupResults.errors.push(`Erreur création rôle ${roleData.name}: ${error.message}`);
            }
        }
        // 4. Créer les salons avec permissions
        const channelsToCreate = {
            // Catégorie GÉNÉRAL
            'règles': {
                category: '📋 GÉNÉRAL',
                type: ChannelType.GuildText,
                topic: 'Règles et informations importantes du serveur',
                permissions: 'readonly' // Lecture seule pour @everyone
            },
            'annonces': {
                category: '📋 GÉNÉRAL',
                type: ChannelType.GuildText,
                topic: 'Annonces officielles du serveur',
                permissions: 'readonly' // Lecture seule pour @everyone
            },
            'roles': {
                category: '📋 GÉNÉRAL',
                type: ChannelType.GuildText,
                topic: 'Sélectionnez vos rôles et votre langue',
                permissions: 'readonly' // Lecture seule pour @everyone
            },
            // Catégorie COMMUNAUTÉ
            'général': {
                category: '👥 COMMUNAUTÉ',
                type: ChannelType.GuildText,
                topic: 'Discussion générale',
                permissions: 'public' // Accessible à tous
            },
            'français': {
                category: '👥 COMMUNAUTÉ',
                type: ChannelType.GuildText,
                topic: 'Discussion en français',
                permissions: 'french' // Accessible aux membres avec rôle français
            },
            'english': {
                category: '👥 COMMUNAUTÉ',
                type: ChannelType.GuildText,
                topic: 'English discussion',
                permissions: 'english' // Accessible aux membres avec rôle anglais
            },

            // Catégorie SUPPORT
            'support': {
                category: '🎫 SUPPORT',
                type: ChannelType.GuildText,
                topic: 'Demandes d\'aide et support',
                permissions: 'public' // Accessible à tous
            },
            'tickets': {
                category: '🎫 SUPPORT',
                type: ChannelType.GuildText,
                topic: 'Création de tickets de support',
                permissions: 'readonly' // Lecture seule pour @everyone
            },
            // Catégorie STAFF
            'staff-général': {
                category: '👑 STAFF',
                type: ChannelType.GuildText,
                topic: 'Discussion staff privée',
                permissions: 'staff' // Accessible uniquement au staff
            },
            'logs': {
                category: '👑 STAFF',
                type: ChannelType.GuildText,
                topic: 'Logs du serveur et du bot',
                permissions: 'staff' // Accessible uniquement au staff
            }
        };

        for (const [channelName, channelData] of Object.entries(channelsToCreate)) {
            try {
                const existingChannel = guild.channels.cache.find(c => c.name === channelName);
                
                if (!existingChannel || force) {
                    if (existingChannel && force) {
                        await existingChannel.delete();
                    }
                    
                    const category = guild.channels.cache.find(c => c.name === channelData.category && c.type === ChannelType.GuildCategory);
                    
                    // Créer les permissions selon le type de salon
                    const permissionOverwrites = await createChannelPermissions(guild, channelData.permissions);
                    
                    const channel = await guild.channels.create({
                        name: channelName,
                        type: channelData.type,
                        topic: channelData.topic,
                        parent: category?.id,
                        permissionOverwrites: permissionOverwrites
                    });
                    
                    setupResults.channelsCreated.push(channelName);
                    
                    // Mettre à jour la config avec certains salons importants
                    if (channelName === 'logs') {
                        await updateConfigChannel('logs', channel.id);
                    } else if (channelName === 'tickets') {
                        await updateConfigChannel('tickets', channel.id);
                    }
                }
            } catch (error) {
                setupResults.errors.push(`Erreur création salon ${channelName}: ${error.message}`);
            }
        }

        // 4. Créer l'embed de résumé
        const embed = new EmbedBuilder()
            .setTitle('🚀 Configuration du serveur terminée !')
            .setColor(config.colors.success)
            .setDescription('Le serveur a été nettoyé et configuré avec succès !')
            .setTimestamp()
            .setFooter({ 
                text: 'MenMuse Bot • Configuration serveur', 
                iconURL: interaction.client.user.displayAvatarURL() 
            });

        embed.addFields({
            name: '🧹 Nettoyage effectué',
            value: `Salons supprimés: ${setupResults.cleanupResults?.channelsDeleted?.length || 0}\nRôles supprimés: ${setupResults.cleanupResults?.rolesDeleted?.length || 0}`,
            inline: true
        });

        if (setupResults.categoriesCreated.length > 0) {
            embed.addFields({
                name: '📁 Catégories créées',
                value: setupResults.categoriesCreated.join('\n') || 'Aucune',
                inline: true
            });
        }

        if (setupResults.rolesCreated.length > 0) {
            embed.addFields({
                name: '🎭 Rôles créés',
                value: setupResults.rolesCreated.join('\n') || 'Aucun',
                inline: true
            });
        }

        if (setupResults.channelsCreated.length > 0) {
            embed.addFields({
                name: '💬 Salons créés',
                value: setupResults.channelsCreated.join('\n') || 'Aucun',
                inline: true
            });
        }

        if (setupResults.errors.length > 0 || (setupResults.cleanupResults?.errors?.length > 0)) {
            const allErrors = [...setupResults.errors, ...(setupResults.cleanupResults?.errors || [])];
            embed.addFields({
                name: '⚠️ Erreurs',
                value: allErrors.slice(0, 5).join('\n') + (allErrors.length > 5 ? '\n...' : ''),
                inline: false
            });
            embed.setColor(config.colors.warning);
        }

        embed.addFields({
            name: '📝 Prochaines étapes',
            value: '• Utilisez `/autorole setup` dans le salon #roles\n• Configurez les permissions des salons selon vos besoins\n• Personnalisez les rôles et salons créés',
            inline: false
        });

        await interaction.editReply({ embeds: [embed] });

    } catch (error) {
        console.error('Erreur lors de la configuration:', error);
        await interaction.editReply({ 
            content: '❌ Une erreur critique est survenue lors de la configuration du serveur.' 
        });
    }
}

// Fonction pour mettre à jour la configuration avec les IDs des rôles
async function updateConfigRole(roleKey, roleId) {
    try {
        const configPath = path.join(__dirname, '../../botconfig/config.json');
        const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        configData.roles[roleKey] = roleId;
        
        fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));
    } catch (error) {
        console.error(`Erreur mise à jour config rôle ${roleKey}:`, error);
    }
}

// Fonction pour nettoyer le serveur
async function cleanupServer(guild, force) {
    const cleanupResults = {
        channelsDeleted: [],
        rolesDeleted: [],
        errors: []
    };
    
    try {
        // Supprimer tous les salons (sauf les salons système)
        const channelsToDelete = guild.channels.cache.filter(channel => 
            !channel.name.includes('rules') && 
            !channel.name.includes('general') &&
            channel.name !== 'Text Channels' &&
            channel.name !== 'Voice Channels' &&
            channel.type !== 4 // Ne pas supprimer les catégories par défaut
        );
        
        for (const [channelId, channel] of channelsToDelete) {
            try {
                await channel.delete('Nettoyage du serveur via /setup server');
                cleanupResults.channelsDeleted.push(channel.name);
            } catch (error) {
                cleanupResults.errors.push(`Erreur suppression salon ${channel.name}: ${error.message}`);
            }
        }
        
        // Supprimer tous les rôles (sauf @everyone et les rôles de bot)
        const rolesToDelete = guild.roles.cache.filter(role => 
            !role.managed && // Ne pas supprimer les rôles de bot
            role.name !== '@everyone' &&
            role.position < guild.members.me.roles.highest.position // Ne supprimer que les rôles inférieurs au bot
        );
        
        for (const [roleId, role] of rolesToDelete) {
            try {
                await role.delete('Nettoyage du serveur via /setup server');
                cleanupResults.rolesDeleted.push(role.name);
            } catch (error) {
                cleanupResults.errors.push(`Erreur suppression rôle ${role.name}: ${error.message}`);
            }
        }
        
        console.log('Nettoyage terminé:', cleanupResults);
        
    } catch (error) {
        console.error('Erreur lors du nettoyage du serveur:', error);
        cleanupResults.errors.push(`Erreur générale de nettoyage: ${error.message}`);
    }
    
    return cleanupResults;
}

// Fonction pour créer les permissions des salons
async function createChannelPermissions(guild, permissionType) {
    const permissionOverwrites = [];
    
    // Récupérer les rôles nécessaires
    const everyoneRole = guild.roles.everyone;
    const staffRole = guild.roles.cache.find(r => r.name === '👑 Staff');
    const frenchRole = guild.roles.cache.find(r => r.name === '🇫🇷 Français');
    const englishRole = guild.roles.cache.find(r => r.name === '🇬🇧 English');

    
    switch (permissionType) {
        case 'readonly':
            // Lecture seule pour @everyone, écriture pour staff
            permissionOverwrites.push({
                id: everyoneRole.id,
                deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions]
            });
            if (staffRole) {
                permissionOverwrites.push({
                    id: staffRole.id,
                    allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions, PermissionFlagsBits.ManageMessages]
                });
            }
            break;
            
        case 'public':
            // Accessible à tous les membres
            permissionOverwrites.push({
                id: everyoneRole.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
            });
            break;
            
        case 'staff':
            // Accessible uniquement au staff
            permissionOverwrites.push({
                id: everyoneRole.id,
                deny: [PermissionFlagsBits.ViewChannel]
            });
            if (staffRole) {
                permissionOverwrites.push({
                    id: staffRole.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages]
                });
            }
            break;
            
        case 'french':
            // Accessible aux membres avec rôle français
            permissionOverwrites.push({
                id: everyoneRole.id,
                deny: [PermissionFlagsBits.ViewChannel]
            });
            if (frenchRole) {
                permissionOverwrites.push({
                    id: frenchRole.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
                });
            }
            if (staffRole) {
                permissionOverwrites.push({
                    id: staffRole.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages]
                });
            }
            break;
            
        case 'english':
            // Accessible aux membres avec rôle anglais
            permissionOverwrites.push({
                id: everyoneRole.id,
                deny: [PermissionFlagsBits.ViewChannel]
            });
            if (englishRole) {
                permissionOverwrites.push({
                    id: englishRole.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
                });
            }
            if (staffRole) {
                permissionOverwrites.push({
                    id: staffRole.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.ManageMessages]
                });
            }
            break;
            

            
        default:
            // Permissions par défaut
            break;
    }
    
    return permissionOverwrites;
}

// Fonction pour mettre à jour la configuration avec les IDs des salons
async function updateConfigChannel(channelKey, channelId) {
    try {
        const configPath = path.join(__dirname, '../../botconfig/config.json');
        const configData = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        
        configData.channels[channelKey] = channelId;
        
        fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));
    } catch (error) {
        console.error(`Erreur mise à jour config salon ${channelKey}:`, error);
    }
}