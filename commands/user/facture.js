const { SlashCommandBuilder, EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { PDFDocument: PDFLib, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const { query } = require('../../config/database');
const config = require('../../config');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('facture')
        .setDescription('Génère une facture personnalisée avec le modèle demandé')
        .addStringOption(option =>
            option.setName('modele')
                .setDescription('Nom du modèle de facture')
                .setRequired(true)
                .setAutocomplete(true)
        ),
    
    cooldown: 10,

    async autocomplete(interaction) {
        // Vérifier la validité de l'interaction
        const now = Date.now();
        const interactionTime = interaction.createdTimestamp;
        const timeDiff = now - interactionTime;
        
        // Si l'interaction a plus de 3 secondes, elle pourrait être expirée
        if (timeDiff > 3000) {
            console.log('Interaction d\'autocomplétion facture potentiellement expirée, ignorée');
            return;
        }
        
        const focused = interaction.options.getFocused();
        const templatesDir = path.join(__dirname, '../../assets/pdf-templates');
        
        try {
            if (!fs.existsSync(templatesDir)) {
                return await interaction.respond([]);
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

            await interaction.respond(files);
        } catch (error) {
            console.error('Erreur lors de l\'autocomplétion des factures:', error);
        }
    },

    async execute(interaction) {
        const modele = interaction.options.getString('modele');
        
        try {
            // Vérifier le statut de l'utilisateur
            const userResult = await query('SELECT * FROM users WHERE discord_id = ?', [interaction.user.id]);
            const user = userResult[0];

            if (!user) {
                return interaction.reply({ 
                    content: '❌ Erreur: utilisateur non trouvé dans la base de données.', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            if (user.status === 'banni') {
                return interaction.reply({ 
                    content: '🚫 Vous êtes banni du service.', 
                    flags: MessageFlags.Ephemeral 
                });
            }

            // Vérifier les crédits (sauf pour premium et staff)
            const facturesCost = 5; // Coût fixe selon le cahier des charges
            
            if (user.status !== 'premium' && user.status !== 'staff') {
                if (user.credits < facturesCost) {
                    // Créer les boutons d'action selon le cahier des charges
                    const buyCreditsButton = new ButtonBuilder()
                        .setCustomId('buy_credits')
                        .setLabel('💳 Acheter des crédits')
                        .setStyle(ButtonStyle.Primary);

                    const referralButton = new ButtonBuilder()
                        .setCustomId('referral_credits')
                        .setLabel('👥 Parrainer un ami')
                        .setStyle(ButtonStyle.Secondary);

                    const row = new ActionRowBuilder().addComponents(buyCreditsButton, referralButton);

                    return interaction.reply({
                        content: `${config.emojis.error} **Vous n'avez pas assez de crédits pour générer une facture.**\n\n` +
                                `💰 **Crédits requis:** ${facturesCost}\n` +
                                `💳 **Votre solde:** ${user.credits} crédits\n\n` +
                                `Choisissez une option ci-dessous :`,
                        components: [row],
                        flags: MessageFlags.Ephemeral
                    });
                }
            }

            // Vérifier que le modèle existe
            const templatePath = path.join(__dirname, '../../assets/pdf-templates', `${modele}.pdf`);
            if (!fs.existsSync(templatePath)) {
                return interaction.reply({ 
                    content: '❌ Modèle de facture introuvable. Utilisez l\'autocomplétion pour voir les modèles disponibles.', 
                    flags: 64 
                });
            }

            // Charger le PDF et extraire les champs
            const pdfBytes = fs.readFileSync(templatePath);
            const pdfDoc = await PDFLib.load(pdfBytes);
            const form = pdfDoc.getForm();
            const fields = form.getFields();
            const fieldNames = [...new Set(fields.map(f => f.getName()))];

            if (fieldNames.length === 0) {
                return interaction.reply({ 
                    content: '❌ Ce modèle de facture ne contient aucun champ à remplir.', 
                    flags: 64 
                });
            }

            // Analyser les champs pour détecter les calculs automatiques
            const baseFields = [];
            const calculatedFields = [];

            fieldNames.forEach(fieldName => {
                if (this.isCalculatedField(fieldName)) {
                    calculatedFields.push(fieldName);
                } else {
                    baseFields.push(fieldName);
                }
            });

            // Créer la modale avec tous les champs de base (maximum 5 selon Discord)
            const maxFields = 5;
            const fieldsToShow = baseFields.slice(0, maxFields);

            const modal = new ModalBuilder()
                .setCustomId(`facture_modal_${modele}`)
                .setTitle(`Facture - ${modele.replace(/[_\-]/g, ' ')}`);

            const rows = fieldsToShow.map(name => {
                let displayName = this.formatFieldName(name);
                
                return new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId(name)
                        .setLabel(displayName.substring(0, 45))
                        .setStyle(this.getInputStyle(name))
                        .setRequired(this.isRequiredField(name))
                        .setMaxLength(200)
                        .setPlaceholder(this.getPlaceholder(name))
                );
            });

            modal.addComponents(...rows);

            // Informer l'utilisateur du coût
            let costMessage = '';
            if (user.status === 'premium' || user.status === 'staff') {
                costMessage = '\n\n👑 **Génération gratuite** (statut premium)';
            } else {
                costMessage = `\n\n💰 **Coût:** ${facturesCost} crédits\n**Solde actuel:** ${user.credits} crédits`;
            }

            // Afficher la modale
            await interaction.showModal(modal);

        } catch (error) {
            console.error('Erreur lors de l\'exécution de la commande facture:', error);
            
            const errorMessage = '❌ Une erreur est survenue lors de la préparation de la facture.';
            
            if (!interaction.replied) {
                await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
            }
        }
    },

    // Méthodes utilitaires pour l'analyse des champs
    isCalculatedField(fieldName) {
        const calculationPatterns = [
            /\+\d+%/,           // prix+20%
            /\*\d+\.?\d*/,      // prix*1.2
            /-\d+%/,            // prix-10%
            /\/\d+\.?\d*/,      // prix/2
            /HT->TTC/i,         // HT vers TTC
            /TTC->HT/i,         // TTC vers HT
            /\+\d+/,            // prix+100
            /-\d+/              // prix-50
        ];
        
        return calculationPatterns.some(pattern => pattern.test(fieldName));
    },

    formatFieldName(fieldName) {
        // Nettoyer le nom du champ pour l'affichage
        let displayName = fieldName
            .replace(/_/g, ' ')
            .replace(/([A-Z])/g, ' $1')
            .replace(/\b\w/g, l => l.toUpperCase())
            .trim();
        
        return displayName;
    },

    getInputStyle(fieldName) {
        // Déterminer le style d'input selon le type de champ
        const longTextFields = ['description', 'notes', 'commentaire', 'adresse'];
        
        if (longTextFields.some(field => fieldName.toLowerCase().includes(field))) {
            return TextInputStyle.Paragraph;
        }
        
        return TextInputStyle.Short;
    },

    isRequiredField(fieldName) {
        // Champs obligatoires typiques d'une facture
        const requiredFields = ['prix', 'montant', 'total', 'client', 'nom'];
        
        return requiredFields.some(field => fieldName.toLowerCase().includes(field));
    },

    getPlaceholder(fieldName) {
        const lowerName = fieldName.toLowerCase();
        
        if (lowerName.includes('prix') || lowerName.includes('montant') || lowerName.includes('total')) {
            return 'Ex: 100.50';
        } else if (lowerName.includes('date')) {
            return 'Ex: 01/01/2024';
        } else if (lowerName.includes('nom') || lowerName.includes('client')) {
            return 'Ex: Jean Dupont';
        } else if (lowerName.includes('email')) {
            return 'Ex: client@example.com';
        } else if (lowerName.includes('telephone') || lowerName.includes('tel')) {
            return 'Ex: 01 23 45 67 89';
        }
        
        return `Entrez ${this.formatFieldName(fieldName).toLowerCase()}`;
    },

    // Méthode pour calculer les valeurs automatiques
    calculateFieldValue(baseValue, fieldName) {
        try {
            const numericValue = parseFloat(baseValue.toString().replace(/[^\d.-]/g, ''));
            
            if (isNaN(numericValue)) return baseValue;

            // Pourcentages d'addition
            const addPercentMatch = fieldName.match(/\+(\d+)%/);
            if (addPercentMatch) {
                const percent = parseInt(addPercentMatch[1]);
                return (numericValue * (1 + percent / 100)).toFixed(2);
            }

            // Pourcentages de soustraction
            const subPercentMatch = fieldName.match(/-(\d+)%/);
            if (subPercentMatch) {
                const percent = parseInt(subPercentMatch[1]);
                return (numericValue * (1 - percent / 100)).toFixed(2);
            }

            // Multiplication
            const multiplyMatch = fieldName.match(/\*(\d+\.?\d*)/);
            if (multiplyMatch) {
                const multiplier = parseFloat(multiplyMatch[1]);
                return (numericValue * multiplier).toFixed(2);
            }

            // Division
            const divideMatch = fieldName.match(/\/(\d+\.?\d*)/);
            if (divideMatch) {
                const divisor = parseFloat(divideMatch[1]);
                return (numericValue / divisor).toFixed(2);
            }

            // Addition simple
            const addMatch = fieldName.match(/\+(\d+)/);
            if (addMatch) {
                const addition = parseInt(addMatch[1]);
                return (numericValue + addition).toFixed(2);
            }

            // Soustraction simple
            const subMatch = fieldName.match(/-(\d+)/);
            if (subMatch) {
                const subtraction = parseInt(subMatch[1]);
                return (numericValue - subtraction).toFixed(2);
            }

            // Conversion HT vers TTC (TVA 20% par défaut)
            if (/HT->TTC/i.test(fieldName)) {
                return (numericValue * 1.20).toFixed(2);
            }

            // Conversion TTC vers HT
            if (/TTC->HT/i.test(fieldName)) {
                return (numericValue / 1.20).toFixed(2);
            }

            return baseValue;
        } catch (error) {
            console.error('Erreur lors du calcul automatique:', error);
            return baseValue;
        }
    }
};