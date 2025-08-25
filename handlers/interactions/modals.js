/**
 * Gestionnaire de modales Discord.js v14.21
 * Gestion centralisée des formulaires avec validation et traitement
 */

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, MessageFlags } = require('discord.js');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');
const { query } = require('../../config/database');
const config = require('../../config');
const Logger = require('../../utils/logger');
const InteractionValidator = require('./validator');
const FactureUtils = require('../../utils/factureUtils');

class ModalHandler {
    constructor(client) {
        this.client = client;
        this.validator = new InteractionValidator();
        this.logger = new Logger('ModalHandler');
        
        // Stockage temporaire des données de formulaire
        if (!this.client.formData) {
            this.client.formData = new Map();
        }
        
        // Registre des gestionnaires de modales
        this.handlers = new Map();
        this._registerHandlers();
    }

    /**
     * Enregistre tous les gestionnaires de modales
     */
    _registerHandlers() {
        this.handlers.set('modal_', this._handlePDFModal.bind(this));
        this.handlers.set('modal_facture_', this._handleFactureModal.bind(this));
    }

    /**
     * Gère une soumission de modale
     * @param {import('discord.js').ModalSubmitInteraction} interaction 
     */
    async handle(interaction) {
        if (!this.validator.isValidModalId(interaction.customId)) {
            this.logger.warn('CustomId de modale invalide', {
                customId: interaction.customId,
                userId: interaction.user.id
            });
            return this._replyError(interaction, '❌ Formulaire invalide.');
        }

        // Trouver le gestionnaire approprié
        const handler = this._findHandler(interaction.customId);
        
        if (!handler) {
            this.logger.warn('Gestionnaire de modale introuvable', {
                customId: interaction.customId,
                userId: interaction.user.id
            });
            return this._replyError(interaction, '❌ Type de formulaire non reconnu.');
        }

        try {
            await handler(interaction);
            
            this.logger.info('Modale traitée avec succès', {
                customId: interaction.customId,
                userId: interaction.user.id
            });
        } catch (error) {
            this.logger.error('Erreur lors du traitement de la modale', {
                customId: interaction.customId,
                userId: interaction.user.id,
                error: error.message,
                stack: error.stack
            });

            await this._handleError(interaction, error);
        }
    }

    /**
     * Trouve le gestionnaire approprié pour un customId
     * @param {string} customId 
     * @returns {Function|null}
     */
    _findHandler(customId) {
        for (const [prefix, handler] of this.handlers.entries()) {
            if (customId.startsWith(prefix)) {
                return handler;
            }
        }
        return null;
    }

    /**
     * Gère les modales PDF
     * @param {import('discord.js').ModalSubmitInteraction} interaction 
     */
    async _handlePDFModal(interaction) {
        const parts = interaction.customId.split('_');
        if (parts.length < 3) {
            return this._replyError(interaction, '❌ Format de modale invalide.');
        }

        const [, model, pageStr] = parts;
        const page = parseInt(pageStr, 10);

        if (isNaN(page)) {
            return this._replyError(interaction, '❌ Page invalide.');
        }

        try {
            // Vérifier si l'interaction est encore valide avant de différer
            if (!interaction.replied && !interaction.deferred) {
                await this._deferReply(interaction, '⏳ Traitement en cours...');
            }

            // Vérifier le statut de l'utilisateur
            const userStatus = await this._getUserStatus(interaction.user.id);
            if (userStatus === 'banned') {
                return interaction.editReply({ content: '🚫 Vous êtes banni du service.' });
            }

            // Charger le modèle PDF
            const templatePath = path.join(__dirname, '../../assets/pdf-templates', `${model}.pdf`);
            
            if (!fs.existsSync(templatePath)) {
                return interaction.editReply({ content: '❌ Modèle PDF introuvable.' });
            }

            const pdfBytes = fs.readFileSync(templatePath);
            const pdfDoc = await PDFDocument.load(pdfBytes);
            const form = pdfDoc.getForm();
            const fieldNames = [...new Set(form.getFields().map(f => f.getName()))];
            
            // Récupérer les données existantes
            const dataKey = `${interaction.user.id}_${model}`;
            const existingData = this.client.formData.get(dataKey) || {};
            
            // Ajouter les nouvelles données
            const maxFields = 5;
            const slice = fieldNames.slice(page * maxFields, (page + 1) * maxFields);
            
            slice.forEach(fieldName => {
                const value = interaction.fields.getTextInputValue(fieldName);
                if (value && value.trim()) {
                    existingData[fieldName] = value.trim();
                }
            });
            
            // Sauvegarder les données
            this.client.formData.set(dataKey, existingData);
            
            const nextPage = page + 1;
            const hasMorePages = nextPage * maxFields < fieldNames.length;
            
            if (hasMorePages) {
                // Il y a encore des champs à remplir
                await this._showProgressAndContinue(interaction, model, existingData, nextPage);
            } else {
                // Tous les champs sont remplis, générer le PDF
                await this._generatePDF(interaction, model, fieldNames, existingData, form, pdfDoc);
            }
            
        } catch (error) {
            this.logger.error('Erreur lors du traitement de la modale PDF', {
                model,
                page,
                error: error.message
            });
            
            if (interaction.deferred) {
                await interaction.editReply({ content: '❌ Une erreur est survenue lors du traitement.' });
            }
        }
    }

    /**
     * Gère les modales de facture
     * @param {import('discord.js').ModalSubmitInteraction} interaction 
     */
    async _handleFactureModal(interaction) {
        const parts = interaction.customId.split('_');
        if (parts.length < 4) {
            return this._replyError(interaction, '❌ Format de modale de facture invalide.');
        }

        const [, , model, pageStr] = parts;
        const page = parseInt(pageStr, 10);

        try {
            await this._deferReply(interaction, '⏳ Traitement de la facture...');

            // Utiliser FactureUtils pour traiter la facture
            const result = await FactureUtils.processFactureModal(interaction, model, page);
            
            if (result.success) {
                if (result.hasMorePages) {
                    await this._showFactureProgress(interaction, model, result.data, result.nextPage);
                } else {
                    await this._generateFacture(interaction, model, result.data);
                }
            } else {
                await interaction.editReply({ content: result.message });
            }
            
        } catch (error) {
            this.logger.error('Erreur lors du traitement de la modale facture', {
                model,
                page,
                error: error.message
            });
            
            if (interaction.deferred) {
                await interaction.editReply({ content: '❌ Une erreur est survenue lors du traitement de la facture.' });
            }
        }
    }

    /**
     * Affiche le progrès et permet de continuer
     * @param {import('discord.js').ModalSubmitInteraction} interaction 
     * @param {string} model 
     * @param {Object} data 
     * @param {number} nextPage 
     */
    async _showProgressAndContinue(interaction, model, data, nextPage) {
        const embed = new EmbedBuilder()
            .setTitle('📋 Progression du formulaire')
            .setDescription(`**Modèle:** ${model}\n**Champs remplis:** ${Object.keys(data).length}`)
            .setColor(config.colors.info)
            .setTimestamp();

        // Afficher quelques champs remplis
        const displayFields = Object.entries(data).slice(0, 10);
        displayFields.forEach(([key, value]) => {
            const displayName = key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();
            embed.addFields({
                name: displayName.charAt(0).toUpperCase() + displayName.slice(1),
                value: value || 'Non renseigné',
                inline: true
            });
        });

        if (Object.keys(data).length > 10) {
            embed.addFields({
                name: 'Et plus...',
                value: `${Object.keys(data).length - 10} autres champs remplis`,
                inline: false
            });
        }

        const nextButton = new ButtonBuilder()
            .setCustomId(`next_${model}_${nextPage}`)
            .setLabel('Continuer')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('➡️');

        const row = new ActionRowBuilder().addComponents(nextButton);

        await interaction.editReply({
            content: 'Cliquez sur **Continuer** pour remplir les champs suivants.',
            embeds: [embed],
            components: [row]
        });
    }

    /**
     * Affiche le progrès des factures
     * @param {import('discord.js').ModalSubmitInteraction} interaction 
     * @param {string} model 
     * @param {Object} data 
     * @param {number} nextPage 
     */
    async _showFactureProgress(interaction, model, data, nextPage) {
        const embed = new EmbedBuilder()
            .setTitle('🧾 Progression de la facture')
            .setDescription(`**Modèle:** ${model}\n**Étape:** ${nextPage + 1}`)
            .setColor(config.colors.info)
            .setTimestamp();

        const nextButton = new ButtonBuilder()
            .setCustomId(`next_facture_${model}_${nextPage}`)
            .setLabel('Étape suivante')
            .setStyle(ButtonStyle.Primary)
            .setEmoji('➡️');

        const row = new ActionRowBuilder().addComponents(nextButton);

        await interaction.editReply({
            content: 'Cliquez sur **Étape suivante** pour continuer.',
            embeds: [embed],
            components: [row]
        });
    }

    /**
     * Génère le PDF final
     * @param {import('discord.js').ModalSubmitInteraction} interaction 
     * @param {string} model 
     * @param {string[]} fieldNames 
     * @param {Object} data 
     * @param {Object} form 
     * @param {Object} pdfDoc 
     */
    async _generatePDF(interaction, model, fieldNames, data, form, pdfDoc) {
        try {
            // Vérifier les crédits
            const user = await this._getUserData(interaction.user.id);
            const creditCost = config.credits.pdfCost || 1;
            
            if (user.status !== 'premium' && user.status !== 'staff' && user.credits < creditCost) {
                return interaction.editReply({
                    content: `❌ Crédits insuffisants. Vous avez **${user.credits}** crédits, **${creditCost}** requis.`
                });
            }

            // Remplir les champs du PDF
            fieldNames.forEach(fieldName => {
                const value = data[fieldName] || '';
                try {
                    const field = form.getTextField(fieldName);
                    field.setText(value);
                } catch (error) {
                    this.logger.debug(`Champ ${fieldName} non trouvé ou erreur`, {
                        error: error.message
                    });
                }
            });

            // Aplatir le formulaire
            form.flatten();

            // Générer le PDF
            const filledPdf = await pdfDoc.save();
            const file = new AttachmentBuilder(Buffer.from(filledPdf), { 
                name: `${model}_${Date.now()}.pdf` 
            });

            // Créer l'embed de résumé
            const embed = this._createSummaryEmbed(model, data, user, creditCost);

            // Déduire les crédits si nécessaire
            if (user.status !== 'premium' && user.status !== 'staff') {
                await this._deductCredits(interaction.user.id, creditCost, `Génération PDF: ${model}`);
            }

            // Nettoyer les données temporaires
            const dataKey = `${interaction.user.id}_${model}`;
            this.client.formData.delete(dataKey);

            // Logger l'utilisation
            await this._logUsage(interaction.user.id, 'pdf_generation', model, creditCost);

            // Envoyer la réponse
            await interaction.editReply({
                content: null,
                embeds: [embed],
                files: [file],
                components: []
            });

            this.logger.info('PDF généré avec succès', {
                model,
                userId: interaction.user.id,
                fieldsCount: Object.keys(data).length
            });

        } catch (error) {
            this.logger.error('Erreur lors de la génération du PDF', {
                model,
                error: error.message
            });
            
            await interaction.editReply({ 
                content: '❌ Une erreur est survenue lors de la génération du PDF.' 
            });
        }
    }

    /**
     * Génère une facture
     * @param {import('discord.js').ModalSubmitInteraction} interaction 
     * @param {string} model 
     * @param {Object} data 
     */
    async _generateFacture(interaction, model, data) {
        try {
            const result = await FactureUtils.generateFacture(interaction.user.id, model, data);
            
            if (result.success) {
                const embed = new EmbedBuilder()
                    .setTitle('🧾 Facture générée avec succès !')
                    .setDescription(`**Modèle:** ${model}`)
                    .setColor(config.colors.success)
                    .setTimestamp();

                await interaction.editReply({
                    embeds: [embed],
                    files: [result.file],
                    components: []
                });
            } else {
                await interaction.editReply({ content: result.message });
            }
        } catch (error) {
            this.logger.error('Erreur lors de la génération de la facture', {
                model,
                error: error.message
            });
            
            await interaction.editReply({ 
                content: '❌ Une erreur est survenue lors de la génération de la facture.' 
            });
        }
    }

    /**
     * Crée un embed de résumé pour le PDF
     * @param {string} model 
     * @param {Object} data 
     * @param {Object} user 
     * @param {number} creditCost 
     * @returns {EmbedBuilder}
     */
    _createSummaryEmbed(model, data, user, creditCost) {
        const embed = new EmbedBuilder()
            .setTitle('📄 PDF généré avec succès !')
            .setColor(config.colors.success)
            .setDescription(`**Modèle:** ${model}\n**Champs remplis:** ${Object.keys(data).length}`)
            .setTimestamp()
            .setFooter({ 
                text: 'MenMuse Bot', 
                iconURL: this.client.user.displayAvatarURL() 
            });

        // Afficher quelques champs remplis
        const displayFields = Object.entries(data).slice(0, 8);
        displayFields.forEach(([key, value]) => {
            const displayName = key.replace(/_/g, ' ').replace(/([A-Z])/g, ' $1').trim();
            embed.addFields({
                name: displayName.charAt(0).toUpperCase() + displayName.slice(1),
                value: value || 'Non renseigné',
                inline: true
            });
        });

        if (Object.keys(data).length > 8) {
            embed.addFields({
                name: 'Et plus...',
                value: `${Object.keys(data).length - 8} autres champs`,
                inline: false
            });
        }

        // Informations sur les crédits
        if (user.status === 'premium' || user.status === 'staff') {
            embed.addFields({
                name: '👑 Premium',
                value: 'Génération gratuite !',
                inline: false
            });
        } else {
            embed.addFields({
                name: '💰 Crédits',
                value: `${creditCost} crédits utilisés\nSolde restant: ${user.credits - creditCost}`,
                inline: false
            });
        }

        return embed;
    }

    /**
     * Récupère les données utilisateur
     * @param {string} userId 
     * @returns {Object}
     */
    async _getUserData(userId) {
        try {
            const result = await query('SELECT * FROM users WHERE discord_id = ?', [userId]);
            return result.length > 0 ? result[0] : { credits: 0, status: 'active' };
        } catch (error) {
            this.logger.error('Erreur lors de la récupération des données utilisateur', {
                userId,
                error: error.message
            });
            return { credits: 0, status: 'active' };
        }
    }

    /**
     * Récupère le statut utilisateur
     * @param {string} userId 
     * @returns {string}
     */
    async _getUserStatus(userId) {
        try {
            const result = await query('SELECT status FROM users WHERE discord_id = ?', [userId]);
            return result.length > 0 ? result[0].status : 'active';
        } catch (error) {
            this.logger.error('Erreur lors de la récupération du statut utilisateur', {
                userId,
                error: error.message
            });
            return 'active';
        }
    }

    /**
     * Déduit des crédits
     * @param {string} userId 
     * @param {number} amount 
     * @param {string} description 
     */
    async _deductCredits(userId, amount, description) {
        try {
            await query('UPDATE users SET credits = credits - ? WHERE discord_id = ?', [amount, userId]);
            
            await query(
                'INSERT INTO transactions (user_id, type, amount, description, created_at) VALUES (?, ?, ?, ?, NOW())',
                [userId, 'debit', amount, description]
            );
        } catch (error) {
            this.logger.error('Erreur lors de la déduction des crédits', {
                userId,
                amount,
                error: error.message
            });
        }
    }

    /**
     * Enregistre l'utilisation
     * @param {string} userId 
     * @param {string} action 
     * @param {string} details 
     * @param {number} creditsUsed 
     */
    async _logUsage(userId, action, details, creditsUsed = 0) {
        try {
            await query(
                'INSERT INTO usage_logs (user_id, action, command_name, details, credits_used, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
                [userId, action, 'pdf', details, creditsUsed]
            );
        } catch (error) {
            this.logger.error('Erreur lors du logging d\'usage', {
                userId,
                action,
                error: error.message
            });
        }
    }

    /**
     * Diffère une réponse
     * @param {import('discord.js').ModalSubmitInteraction} interaction 
     * @param {string} content 
     */
    async _deferReply(interaction, content = '⏳ Traitement en cours...') {
        if (this.validator.canDefer(interaction)) {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });
            if (content !== '⏳ Traitement en cours...') {
                await interaction.editReply({ content });
            }
        }
    }

    /**
     * Répond avec un message d'erreur
     * @param {import('discord.js').ModalSubmitInteraction} interaction 
     * @param {string} message 
     */
    async _replyError(interaction, message) {
        try {
            if (this.validator.canReply(interaction)) {
                await interaction.reply({ content: message, flags: MessageFlags.Ephemeral });
            } else if (this.validator.canEdit(interaction)) {
                await interaction.editReply({ content: message });
            } else {
                await interaction.followUp({ content: message, flags: MessageFlags.Ephemeral });
            }
        } catch (error) {
            this.logger.error('Impossible de répondre avec un message d\'erreur', {
                error: error.message
            });
        }
    }

    /**
     * Gère les erreurs générales
     * @param {import('discord.js').ModalSubmitInteraction} interaction 
     * @param {Error} error 
     */
    async _handleError(interaction, error) {
        const errorMessage = '❌ Une erreur est survenue lors du traitement du formulaire.';
        
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: errorMessage, flags: MessageFlags.Ephemeral });
            } else {
                await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
            }
        } catch (replyError) {
            this.logger.error('Impossible de répondre après erreur', {
                originalError: error.message,
                replyError: replyError.message
            });
        }
    }

    /**
     * Nettoie les données de formulaire expirées
     */
    cleanExpiredFormData() {
        const now = Date.now();
        const maxAge = 30 * 60 * 1000; // 30 minutes
        
        for (const [key, data] of this.client.formData.entries()) {
            if (data.timestamp && (now - data.timestamp) > maxAge) {
                this.client.formData.delete(key);
            }
        }
        
        this.logger.debug('Nettoyage des données de formulaire expirées effectué');
    }
}

module.exports = ModalHandler;