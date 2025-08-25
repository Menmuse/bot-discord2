// Messages localisés pour le bot
const messages = {
    fr: {
        // Messages généraux
        error: "❌ Une erreur est survenue.",
        success: "✅ Opération réussie.",
        loading: "⏳ Chargement en cours...",
        unauthorized: "❌ Vous n'avez pas l'autorisation d'utiliser cette commande.",
        user_not_found: "❌ Utilisateur non trouvé dans la base de données.",
        user_banned: "❌ Vous êtes banni et ne pouvez pas utiliser cette commande.",
        insufficient_credits: "❌ Crédits insuffisants pour effectuer cette action.",
        
        // Messages de crédits
        credits_balance: "💰 Vous avez **{credits}** crédits.",
        credits_added: "✅ **{amount}** crédits ont été ajoutés à votre compte.",
        credits_removed: "✅ **{amount}** crédits ont été retirés de votre compte.",
        credits_reset: "✅ Les crédits ont été réinitialisés.",
        
        // Messages de parrainage
        referral_code_generated: "🎉 Votre code de parrainage: **{code}**",
        referral_success: "✅ Parrainage réussi! Vous avez reçu **{reward}** crédits.",
        referral_already_used: "❌ Vous avez déjà utilisé un code de parrainage.",
        referral_own_code: "❌ Vous ne pouvez pas utiliser votre propre code.",
        referral_invalid_code: "❌ Code de parrainage invalide.",
        
        // Messages de tickets
        ticket_created: "🎫 Ticket créé avec succès!",
        ticket_closed: "✅ Ticket fermé avec succès.",
        ticket_not_found: "❌ Ticket non trouvé.",
        ticket_limit_reached: "❌ Vous avez atteint la limite de tickets ouverts.",
        
        // Messages PDF
        pdf_processing: "📄 Traitement du PDF en cours...",
        pdf_completed: "✅ PDF traité avec succès!",
        pdf_error: "❌ Erreur lors du traitement du PDF.",
        pdf_no_template: "❌ Modèle PDF non trouvé.",
        pdf_no_fields: "❌ Aucun champ à remplir trouvé dans ce PDF.",
        
        // Messages admin
        admin_user_reset: "✅ Utilisateur réinitialisé avec succès.",
        admin_credits_updated: "✅ Crédits mis à jour avec succès.",
        admin_user_banned: "✅ Utilisateur banni avec succès.",
        admin_user_unbanned: "✅ Utilisateur débanni avec succès.",
        
        // Messages d'autorôle
        autorole_enabled: "✅ Autorôle activé pour le rôle {role}.",
        autorole_disabled: "✅ Autorôle désactivé pour le rôle {role}.",
        autorole_not_found: "❌ Configuration d'autorôle non trouvée.",
        
        // Messages de setup
        setup_completed: "✅ Configuration terminée avec succès!",
        setup_error: "❌ Erreur lors de la configuration."
    },
    
    en: {
        // General messages
        error: "❌ An error occurred.",
        success: "✅ Operation successful.",
        loading: "⏳ Loading...",
        unauthorized: "❌ You don't have permission to use this command.",
        user_not_found: "❌ User not found in database.",
        user_banned: "❌ You are banned and cannot use this command.",
        insufficient_credits: "❌ Insufficient credits to perform this action.",
        
        // Credit messages
        credits_balance: "💰 You have **{credits}** credits.",
        credits_added: "✅ **{amount}** credits have been added to your account.",
        credits_removed: "✅ **{amount}** credits have been removed from your account.",
        credits_reset: "✅ Credits have been reset.",
        
        // Referral messages
        referral_code_generated: "🎉 Your referral code: **{code}**",
        referral_success: "✅ Referral successful! You received **{reward}** credits.",
        referral_already_used: "❌ You have already used a referral code.",
        referral_own_code: "❌ You cannot use your own referral code.",
        referral_invalid_code: "❌ Invalid referral code.",
        
        // Ticket messages
        ticket_created: "🎫 Ticket created successfully!",
        ticket_closed: "✅ Ticket closed successfully.",
        ticket_not_found: "❌ Ticket not found.",
        ticket_limit_reached: "❌ You have reached the ticket limit.",
        
        // PDF messages
        pdf_processing: "📄 Processing PDF...",
        pdf_completed: "✅ PDF processed successfully!",
        pdf_error: "❌ Error processing PDF.",
        pdf_no_template: "❌ PDF template not found.",
        pdf_no_fields: "❌ No fields to fill found in this PDF.",
        
        // Admin messages
        admin_user_reset: "✅ User reset successfully.",
        admin_credits_updated: "✅ Credits updated successfully.",
        admin_user_banned: "✅ User banned successfully.",
        admin_user_unbanned: "✅ User unbanned successfully.",
        
        // Autorole messages
        autorole_enabled: "✅ Autorole enabled for role {role}.",
        autorole_disabled: "✅ Autorole disabled for role {role}.",
        autorole_not_found: "❌ Autorole configuration not found.",
        
        // Setup messages
        setup_completed: "✅ Setup completed successfully!",
        setup_error: "❌ Error during setup."
    }
};

// Fonction pour obtenir un message dans la langue spécifiée
function getMessage(key, lang = 'fr', replacements = {}) {
    let message = messages[lang]?.[key] || messages.fr[key] || key;
    
    // Remplacer les placeholders
    for (const [placeholder, value] of Object.entries(replacements)) {
        message = message.replace(new RegExp(`{${placeholder}}`, 'g'), value);
    }
    
    return message;
}

module.exports = {
    messages,
    getMessage
};