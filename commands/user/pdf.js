const { SlashCommandBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { PDFDocument: PDFLib } = require('pdf-lib');
const { query } = require('../../config/database');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pdf')
        .setDescription('Génère un PDF avec le modèle demandé')
        .addStringOption(option =>
            option.setName('model')
                .setDescription('Nom du modèle PDF')
                .setRequired(true)
                .setAutocomplete(true)
        ),
    
    cooldown: 5,

    async autocomplete(interaction) {
        // Vérifier la validité de l'interaction
        const now = Date.now();
        const interactionTime = interaction.createdTimestamp;
        const timeDiff = now - interactionTime;
        
        // Si l'interaction a plus de 2 secondes, elle pourrait être expirée
        if (timeDiff > 2000) {
            console.log('Interaction d\'autocomplétion potentiellement expirée, ignorée');
            return;
        }
        
        // Vérifier si l'interaction a déjà été traitée
        if (interaction.responded || interaction.replied) {
            console.log('Interaction d\'autocomplétion déjà traitée, ignorée');
            return;
        }
        
        const focused = interaction.options.getFocused();
        const templatesDir = path.join(__dirname, '../../assets/pdf-templates');
        
        try {
            if (!fs.existsSync(templatesDir)) {
                // Vérifier à nouveau avant de répondre
                if (!interaction.responded && !interaction.replied) {
                    await interaction.respond([]);
                }
                return;
            }

            const files = fs.readdirSync(templatesDir)
                .filter(f => f.endsWith('.pdf'))
                .map(f => f.replace('.pdf', ''))
                .filter(f => f.toLowerCase().includes(focused.toLowerCase()))
                .slice(0, 25)
                .map(f => ({
                    name: f.replace(/[_\-]/g, ' ').replace(/\b\w/g, l => l.toUpperCase()).slice(0, 100),
                    value: f
                }));

            // Double vérification avant de répondre
            if (!interaction.responded && !interaction.replied) {
                await interaction.respond(files);
            }
        } catch (error) {
            // Ignorer silencieusement les erreurs d'autocomplétion pour éviter les conflits
            if (error.code !== 10062 && error.code !== 40060) {
                console.error('Erreur lors de l\'autocomplétion:', error);
            }
        }
    },

    async execute(interaction) {
        // Vérifier si l'interaction est encore valide avant de différer
        if (interaction.replied || interaction.deferred) {
            console.log('Interaction déjà traitée, abandon');
            return;
        }
        
        // Différer immédiatement l'interaction pour éviter l'expiration
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        } catch (error) {
            console.error('Erreur lors du defer de l\'interaction:', error);
            // Si le defer échoue, essayer de répondre directement
            if (!interaction.replied) {
                try {
                    await interaction.reply({ 
                        content: '❌ Une erreur est survenue lors du traitement de votre demande.',
                        flags: MessageFlags.Ephemeral 
                    });
                } catch (replyError) {
                    console.error('Impossible de répondre à l\'interaction:', replyError);
                }
            }
            return;
        }
        
        // Vérifier si l'utilisateur a les permissions
        if (!interaction.member.permissions.has('Administrator') && !config.allowedUsers.includes(interaction.user.id)) {
            return interaction.editReply({ 
                content: '❌ Vous n\'avez pas les permissions pour utiliser cette commande.' 
            });
        }
        
        const model = interaction.options.getString('model');
        
        try {
            // Vérifier le statut de l'utilisateur
            const userResult = await query('SELECT * FROM users WHERE discord_id = ?', [interaction.user.id]);
            const user = userResult[0];

            if (!user) {
                return await interaction.editReply({ content: '❌ Erreur: utilisateur non trouvé dans la base de données.' });
            }

            if (user.status === 'banni') {
                return await interaction.editReply({ content: '🚫 Vous êtes banni du service.' });
            }

            // Vérifier les crédits (sauf pour premium et staff)
            if (user.status !== 'premium' && user.status !== 'staff') {
                if (user.credits < config.credits.pdfCost) {
                    return await interaction.editReply({
                        content: `❌ Crédits insuffisants. Vous avez **${user.credits}** crédits, **${config.credits.pdfCost}** requis.\n\nUtilisez \`/credits\` pour voir votre solde ou contactez un administrateur pour recharger vos crédits.`
                    });
                }
            }

            // Vérifier que le modèle existe
            const templatesDir = path.join(__dirname, '../../assets/pdf-templates');
            let templatePath = path.join(templatesDir, `${model}.pdf`);
            
            // Si le fichier n'existe pas avec le nom exact, chercher dans le dossier
            if (!fs.existsSync(templatePath)) {
                const availableFiles = fs.readdirSync(templatesDir)
                    .filter(f => f.endsWith('.pdf'))
                    .map(f => f.replace('.pdf', ''));
                
                // Chercher une correspondance exacte (insensible à la casse)
                const exactMatch = availableFiles.find(f => f.toLowerCase() === model.toLowerCase());
                if (exactMatch) {
                    templatePath = path.join(templatesDir, `${exactMatch}.pdf`);
                } else {
                    // Chercher une correspondance partielle
                    const partialMatch = availableFiles.find(f => 
                        f.toLowerCase().includes(model.toLowerCase()) || 
                        model.toLowerCase().includes(f.toLowerCase())
                    );
                    if (partialMatch) {
                        templatePath = path.join(templatesDir, `${partialMatch}.pdf`);
                    } else {
                        const availableModels = availableFiles.join(', ');
                        return await interaction.editReply({ 
                            content: `❌ Modèle PDF introuvable: "${model}".\n\nModèles disponibles: ${availableModels}\n\nUtilisez l'autocomplétion pour voir tous les modèles disponibles.`
                        });
                    }
                }
            }

            // Charger le PDF et extraire les champs
            const pdfBytes = fs.readFileSync(templatePath);
            const pdfDoc = await PDFLib.load(pdfBytes);
            const form = pdfDoc.getForm();
            const fieldNames = [...new Set(form.getFields().map(f => f.getName()))];

            if (fieldNames.length === 0) {
                return await interaction.editReply({ content: '❌ Ce modèle PDF ne contient aucun champ à remplir.' });
            }

            // Créer un bouton pour ouvrir la modale (car on ne peut pas afficher une modale après avoir différé)
            
            const button = new ButtonBuilder()
                .setCustomId(`pdf_modal_${model}`)
                .setLabel('📝 Remplir le formulaire PDF')
                .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder().addComponents(button);

            await interaction.editReply({
                content: `✅ Modèle PDF "${model}" trouvé avec ${fieldNames.length} champ(s) à remplir.\n\nCliquez sur le bouton ci-dessous pour ouvrir le formulaire :`,
                components: [row]
            });

        } catch (error) {
            console.error('Erreur lors de l\'exécution de la commande PDF:', error);
            
            const errorMessage = '❌ Une erreur est survenue lors de la préparation du PDF.';
            
            try {
                await interaction.editReply({ content: errorMessage });
            } catch (replyError) {
                console.error('Erreur lors de la réponse d\'erreur:', replyError);
            }
        }
    },
};