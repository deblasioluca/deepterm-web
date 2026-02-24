import { AppLocale } from './core';

type FeatureItem = {
  title: string;
  description: string;
};

type DeepDiveItem = {
  title: string;
  description: string;
};

type TestimonialItem = {
  quote: string;
  author: string;
  title: string;
  company: string;
};

export type AppMessages = {
  common: {
    language: string;
    loading: string;
  };
  navbar: {
    product: string;
    overview: string;
    features: string;
    integrations: string;
    changelog: string;
    security: string;
    pricing: string;
    enterprise: string;
    login: string;
    register: string;
    toggleMenu: string;
  };
  footer: {
    tagline: string;
    product: string;
    resources: string;
    company: string;
    legal: string;
    documentation: string;
    blog: string;
    helpCenter: string;
    systemStatus: string;
    aboutUs: string;
    careers: string;
    contact: string;
    termsOfUse: string;
    privacy: string;
    download: string;
    rightsReserved: string;
  };
  sidebar: {
    account: string;
    team: string;
    vaults: string;
    samlSso: string;
    twoFactorAuth: string;
    passkeys: string;
    billing: string;
    forStudents: string;
    ideas: string;
    getTheApp: string;
    issues: string;
    securityAssessment: string;
    helpFeedback: string;
    logOut: string;
    expandSidebar: string;
    collapseSidebar: string;
  };
  home: {
    heroTitle: string;
    heroTitleAccent: string;
    heroSubtitle: string;
    getStartedFree: string;
    requestDemo: string;
    noSubscription: string;
    oneTimePurchase: string;
    macosNative: string;
    aiMessage: string;
    aiSuggestion: string;
    trustByline: string;
    featuresTitle: string;
    featuresSubtitle: string;
    features: FeatureItem[];
    deepDiveTitle: string;
    deepDiveSubtitle: string;
    deepDiveFeatures: DeepDiveItem[];
    testimonialsTitle: string;
    testimonialsSubtitle: string;
    previousTestimonial: string;
    nextTestimonial: string;
    testimonialAria: string;
    titleAt: string;
    testimonials: TestimonialItem[];
    ctaTitle: string;
    ctaSubtitle: string;
    ctaButton: string;
  };
  adminLogin: {
    pageTitle: string;
    pageSubtitle: string;
    emailLabel: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    signIn: string;
    signingIn: string;
    footerNotice: string;
    loginFailed: string;
  };
};

export const appMessages: Record<AppLocale, AppMessages> = {
  en: {
    common: {
      language: 'Language',
      loading: 'Loading...',
    },
    navbar: {
      product: 'Product',
      overview: 'Overview',
      features: 'Features',
      integrations: 'Integrations',
      changelog: 'Changelog',
      security: 'Security',
      pricing: 'Pricing',
      enterprise: 'Enterprise',
      login: 'Login',
      register: 'Register',
      toggleMenu: 'Toggle menu',
    },
    footer: {
      tagline: 'The modern SSH client built for macOS with AI-powered assistance.',
      product: 'Product',
      resources: 'Resources',
      company: 'Company',
      legal: 'Legal',
      documentation: 'Documentation',
      blog: 'Blog',
      helpCenter: 'Help Center',
      systemStatus: 'System Status',
      aboutUs: 'About Us',
      careers: 'Careers',
      contact: 'Contact',
      termsOfUse: 'Terms of Use',
      privacy: 'Privacy',
      download: 'Download',
      rightsReserved: 'All rights reserved.',
    },
    sidebar: {
      account: 'Account',
      team: 'Team',
      vaults: 'Vaults',
      samlSso: 'SAML SSO',
      twoFactorAuth: 'Two-Factor Auth',
      passkeys: 'Passkeys',
      billing: 'Billing',
      forStudents: 'For Students',
      ideas: 'Ideas',
      getTheApp: 'Get the App',
      issues: 'Issues',
      securityAssessment: 'Security Assessment',
      helpFeedback: 'Help & Feedback',
      logOut: 'Log out',
      expandSidebar: 'Expand sidebar',
      collapseSidebar: 'Collapse sidebar',
    },
    home: {
      heroTitle: 'The Modern SSH Client',
      heroTitleAccent: 'Built for macOS',
      heroSubtitle: 'Professional SSH connectivity with AI-powered assistance, split terminals, and native macOS performance.',
      getStartedFree: 'Get Started Free',
      requestDemo: 'Request Demo',
      noSubscription: 'No subscription',
      oneTimePurchase: 'One-time purchase',
      macosNative: 'macOS native',
      aiMessage: 'High CPU detected on pid 4821 (api-gw). This process is consuming 89% CPU.',
      aiSuggestion: 'systemctl restart api-gateway',
      trustByline: 'Trusted by 10,000+ engineers at',
      featuresTitle: 'Everything you need to manage servers',
      featuresSubtitle: 'DeepTerm combines powerful terminal emulation with modern productivity features, all wrapped in a beautiful native macOS interface.',
      features: [
        { title: 'AI-Powered Chat Assistant', description: 'Integrated AI chat in the sidebar — get help with terminal commands, server administration, and troubleshooting. Context-aware suggestions based on your current workflow.' },
        { title: 'Encrypted Vaults & Keychain', description: 'All credentials stored exclusively in macOS Keychain — the same secure storage used by Safari and Apple apps. No passwords in plain text, ever.' },
        { title: 'Cross-Platform Sync', description: 'Seamlessly sync hosts, snippets, and sessions across macOS, Windows, Linux, iOS, and Android.' },
        { title: 'Advanced Split Terminal', description: 'Split your terminal horizontally to view multiple sessions simultaneously. Add unlimited panes, resize freely, and navigate with keyboard shortcuts.' },
        { title: 'Command Snippets', description: 'Save frequently used commands for instant one-click execution. Organize snippets into categories. Build your personal command library.' },
        { title: 'Multi-Tab Sessions', description: 'Open unlimited SSH sessions in separate tabs. Switch instantly with ⌘1-9. Each tab shows real-time connection status. Drag-and-drop reordering.' },
      ],
      deepDiveTitle: 'Built for professionals',
      deepDiveSubtitle: 'Every feature is designed with power users in mind. Fast, reliable, and beautiful.',
      deepDiveFeatures: [
        { title: 'Native macOS Performance', description: 'Built from the ground up for macOS using SwiftUI. No Electron, no web views — just native Apple frameworks delivering smooth 120Hz performance, Retina-optimized text rendering, and seamless integration with your Mac. Supports both Apple Silicon and Intel.' },
        { title: 'True Terminal Emulation', description: 'Full VT100/xterm-256color terminal emulation with true PTY support. Real-time output streaming with low latency. Beautiful syntax highlighting, full Unicode and emoji support, and customizable fonts, sizes, and color themes.' },
        { title: 'Keyboard-First Workflow', description: 'Comprehensive keyboard shortcuts for every action. Open connections with ⌘O, new tabs with ⌘T, split terminals with ⌘⇧D, switch tabs with ⌘1-9. Navigate and control everything without ever touching the mouse.' },
        { title: 'SFTP & Port Forwarding', description: 'Built-in SFTP file browser and port forwarding — no extra tools needed. Drag and drop file paths directly into the terminal. Transfer files between hosts and clients with ease.' },
      ],
      testimonialsTitle: 'Loved by engineers worldwide',
      testimonialsSubtitle: 'See what professionals are saying about DeepTerm',
      previousTestimonial: 'Previous testimonial',
      nextTestimonial: 'Next testimonial',
      testimonialAria: 'Go to testimonial',
      titleAt: 'at',
      testimonials: [
        { quote: 'DeepTerm has completely transformed how I manage our production servers. The split terminal views let me monitor logs while deploying, and the AI assistant has saved me countless hours troubleshooting.', author: 'Sarah Chen', title: 'Lead DevOps Engineer', company: 'TechFlow Inc.' },
        { quote: 'Finally, an SSH client that feels native on macOS. The keyboard shortcuts are intuitive, and the performance is incredible. I\'ve tried every terminal app out there — DeepTerm is the one I\'m sticking with.', author: 'Marcus Rodriguez', title: 'Senior Backend Developer', company: 'CloudScale Systems' },
        { quote: 'The command snippets feature alone is worth it. I\'ve saved all our deployment scripts, health checks, and maintenance commands. New team members can be productive from day one.', author: 'Emily Watson', title: 'System Administrator', company: 'DataVault Technologies' },
        { quote: 'Security was my biggest concern with SSH clients. DeepTerm storing everything in macOS Keychain with zero data collection gives me the peace of mind I need for our enterprise environment.', author: 'James Park', title: 'Security Engineer', company: 'SecureOps Global' },
      ],
      ctaTitle: 'Ready to modernize your terminal workflow?',
      ctaSubtitle: 'Join thousands of engineers who have already made the switch to DeepTerm.',
      ctaButton: 'Start Free — No Credit Card Required',
    },
    adminLogin: {
      pageTitle: 'Admin Login',
      pageSubtitle: 'Access the DeepTerm admin panel',
      emailLabel: 'Email',
      passwordLabel: 'Password',
      passwordPlaceholder: '••••••••',
      signIn: 'Sign In',
      signingIn: 'Signing in...',
      footerNotice: 'Protected area. Access restricted to authorized administrators only.',
      loginFailed: 'Login failed',
    },
  },
  de: {
    common: { language: 'Sprache', loading: 'Wird geladen...' },
    navbar: { product: 'Produkt', overview: 'Überblick', features: 'Funktionen', integrations: 'Integrationen', changelog: 'Änderungsprotokoll', security: 'Sicherheit', pricing: 'Preise', enterprise: 'Enterprise', login: 'Anmelden', register: 'Registrieren', toggleMenu: 'Menü umschalten' },
    footer: { tagline: 'Der moderne SSH-Client für macOS mit KI-gestützter Unterstützung.', product: 'Produkt', resources: 'Ressourcen', company: 'Unternehmen', legal: 'Rechtliches', documentation: 'Dokumentation', blog: 'Blog', helpCenter: 'Hilfezentrum', systemStatus: 'Systemstatus', aboutUs: 'Über uns', careers: 'Karriere', contact: 'Kontakt', termsOfUse: 'Nutzungsbedingungen', privacy: 'Datenschutz', download: 'Download', rightsReserved: 'Alle Rechte vorbehalten.' },
    sidebar: { account: 'Konto', team: 'Team', vaults: 'Tresore', samlSso: 'SAML SSO', twoFactorAuth: 'Zwei-Faktor-Auth', passkeys: 'Passkeys', billing: 'Abrechnung', forStudents: 'Für Studierende', ideas: 'Ideen', getTheApp: 'App herunterladen', issues: 'Probleme', securityAssessment: 'Sicherheitsbewertung', helpFeedback: 'Hilfe & Feedback', logOut: 'Abmelden', expandSidebar: 'Seitenleiste erweitern', collapseSidebar: 'Seitenleiste einklappen' },
    home: { heroTitle: 'Der moderne SSH-Client', heroTitleAccent: 'Für macOS entwickelt', heroSubtitle: 'Professionelle SSH-Konnektivität mit KI-Unterstützung, geteilten Terminals und nativer macOS-Performance.', getStartedFree: 'Kostenlos starten', requestDemo: 'Demo anfragen', noSubscription: 'Kein Abo', oneTimePurchase: 'Einmaliger Kauf', macosNative: 'Nativ für macOS', aiMessage: 'Hohe CPU-Auslastung bei PID 4821 (api-gw) erkannt. Dieser Prozess nutzt 89% CPU.', aiSuggestion: 'systemctl restart api-gateway', trustByline: 'Vertraut von über 10.000 Ingenieur:innen bei', featuresTitle: 'Alles, was du zur Serververwaltung brauchst', featuresSubtitle: 'DeepTerm kombiniert leistungsstarke Terminal-Emulation mit moderner Produktivität in einer schönen nativen macOS-Oberfläche.', features: [{ title: 'KI-gestützter Chat-Assistent', description: 'Integrierter KI-Chat in der Seitenleiste für Terminal-Befehle, Server-Administration und Troubleshooting mit kontextbezogenen Vorschlägen.' }, { title: 'Verschlüsselte Tresore & Schlüsselbund', description: 'Alle Zugangsdaten werden ausschließlich im macOS-Schlüsselbund gespeichert. Nie Klartext-Passwörter.' }, { title: 'Plattformübergreifende Synchronisierung', description: 'Synchronisiere Hosts, Snippets und Sitzungen nahtlos zwischen macOS, Windows, Linux, iOS und Android.' }, { title: 'Erweitertes Split-Terminal', description: 'Teile dein Terminal horizontal für mehrere Sitzungen. Unbegrenzte Bereiche, frei skalierbar, mit Shortcuts.' }, { title: 'Befehls-Snippets', description: 'Speichere häufig genutzte Befehle zur Sofortausführung mit einem Klick und organisiere sie nach Kategorien.' }, { title: 'Multi-Tab-Sitzungen', description: 'Unbegrenzte SSH-Sitzungen in Tabs. Schneller Wechsel mit ⌘1-9 und Live-Status pro Tab.' }], deepDiveTitle: 'Für Profis entwickelt', deepDiveSubtitle: 'Jede Funktion ist für Power-User gemacht: schnell, zuverlässig und schön.', deepDiveFeatures: [{ title: 'Native macOS-Performance', description: 'Von Grund auf für macOS mit SwiftUI entwickelt. Keine Webviews, nur native Frameworks mit flüssiger Darstellung.' }, { title: 'Echte Terminal-Emulation', description: 'Vollständige VT100/xterm-256color-Emulation mit PTY-Unterstützung und geringer Latenz.' }, { title: 'Keyboard-First-Workflow', description: 'Umfangreiche Tastaturkürzel für jede Aktion. Volle Kontrolle ohne Maus.' }, { title: 'SFTP & Portweiterleitung', description: 'Integrierter SFTP-Dateibrowser und Portweiterleitung ohne zusätzliche Tools.' }], testimonialsTitle: 'Von Ingenieur:innen weltweit geschätzt', testimonialsSubtitle: 'Das sagen Profis über DeepTerm', previousTestimonial: 'Vorheriges Testimonial', nextTestimonial: 'Nächstes Testimonial', testimonialAria: 'Zum Testimonial', titleAt: 'bei', testimonials: [{ quote: 'DeepTerm hat komplett verändert, wie ich unsere Produktionsserver verwalte. Die geteilten Terminals und der KI-Assistent sparen enorm viel Zeit.', author: 'Sarah Chen', title: 'Leitende DevOps-Ingenieurin', company: 'TechFlow Inc.' }, { quote: 'Endlich ein SSH-Client, der sich auf macOS nativ anfühlt. Die Performance ist großartig.', author: 'Marcus Rodriguez', title: 'Senior Backend-Entwickler', company: 'CloudScale Systems' }, { quote: 'Allein die Snippets lohnen sich. Neue Teammitglieder sind vom ersten Tag an produktiv.', author: 'Emily Watson', title: 'Systemadministratorin', company: 'DataVault Technologies' }, { quote: 'Sicherheit war entscheidend. Speicherung im macOS-Schlüsselbund ohne Datensammlung gibt uns echte Sicherheit.', author: 'James Park', title: 'Security Engineer', company: 'SecureOps Global' }], ctaTitle: 'Bereit, deinen Terminal-Workflow zu modernisieren?', ctaSubtitle: 'Schließe dich tausenden Ingenieur:innen an, die bereits zu DeepTerm gewechselt sind.', ctaButton: 'Kostenlos starten — keine Kreditkarte erforderlich' },
    adminLogin: { pageTitle: 'Admin-Anmeldung', pageSubtitle: 'Zugriff auf das DeepTerm-Admin-Panel', emailLabel: 'E-Mail', passwordLabel: 'Passwort', passwordPlaceholder: '••••••••', signIn: 'Anmelden', signingIn: 'Anmeldung läuft...', footerNotice: 'Geschützter Bereich. Zugriff nur für autorisierte Administratoren.', loginFailed: 'Anmeldung fehlgeschlagen' },
  },
  fr: {
    common: { language: 'Langue', loading: 'Chargement...' },
    navbar: { product: 'Produit', overview: 'Aperçu', features: 'Fonctionnalités', integrations: 'Intégrations', changelog: 'Journal des changements', security: 'Sécurité', pricing: 'Tarifs', enterprise: 'Entreprise', login: 'Connexion', register: 'Inscription', toggleMenu: 'Basculer le menu' },
    footer: { tagline: 'Le client SSH moderne pour macOS avec assistance IA.', product: 'Produit', resources: 'Ressources', company: 'Entreprise', legal: 'Juridique', documentation: 'Documentation', blog: 'Blog', helpCenter: 'Centre d’aide', systemStatus: 'Statut du service', aboutUs: 'À propos', careers: 'Carrières', contact: 'Contact', termsOfUse: 'Conditions d’utilisation', privacy: 'Confidentialité', download: 'Télécharger', rightsReserved: 'Tous droits réservés.' },
    sidebar: { account: 'Compte', team: 'Équipe', vaults: 'Coffres', samlSso: 'SSO SAML', twoFactorAuth: 'Authentification à deux facteurs', passkeys: 'Clés d’accès', billing: 'Facturation', forStudents: 'Pour les étudiants', ideas: 'Idées', getTheApp: 'Télécharger l’app', issues: 'Tickets', securityAssessment: 'Évaluation sécurité', helpFeedback: 'Aide & retours', logOut: 'Se déconnecter', expandSidebar: 'Développer la barre latérale', collapseSidebar: 'Réduire la barre latérale' },
    home: { heroTitle: 'Le client SSH moderne', heroTitleAccent: 'Conçu pour macOS', heroSubtitle: 'Connectivité SSH professionnelle avec assistance IA, terminaux fractionnés et performances macOS natives.', getStartedFree: 'Commencer gratuitement', requestDemo: 'Demander une démo', noSubscription: 'Sans abonnement', oneTimePurchase: 'Achat unique', macosNative: 'Natif macOS', aiMessage: 'CPU élevé détecté sur le pid 4821 (api-gw). Ce processus consomme 89% de CPU.', aiSuggestion: 'systemctl restart api-gateway', trustByline: 'Approuvé par plus de 10 000 ingénieurs chez', featuresTitle: 'Tout ce qu’il faut pour gérer vos serveurs', featuresSubtitle: 'DeepTerm combine une émulation terminal puissante et des fonctions de productivité modernes dans une interface macOS native.', features: [{ title: 'Assistant IA intégré', description: 'Chat IA intégré dans la barre latérale pour les commandes terminal, l’administration serveur et le dépannage.' }, { title: 'Coffres chiffrés & Trousseau', description: 'Identifiants stockés exclusivement dans le Trousseau macOS. Jamais de mot de passe en clair.' }, { title: 'Synchronisation multiplateforme', description: 'Synchronisez hôtes, snippets et sessions entre macOS, Windows, Linux, iOS et Android.' }, { title: 'Terminal fractionné avancé', description: 'Fractionnez le terminal pour plusieurs sessions simultanées, avec redimensionnement libre.' }, { title: 'Snippets de commandes', description: 'Enregistrez vos commandes fréquentes pour une exécution instantanée en un clic.' }, { title: 'Sessions multi-onglets', description: 'Ouvrez des sessions SSH illimitées dans des onglets avec statut de connexion en temps réel.' }], deepDiveTitle: 'Conçu pour les professionnels', deepDiveSubtitle: 'Chaque fonctionnalité est pensée pour les utilisateurs avancés : rapide, fiable et élégante.', deepDiveFeatures: [{ title: 'Performances macOS natives', description: 'Conçu pour macOS avec SwiftUI pour une expérience fluide et native.' }, { title: 'Vraie émulation terminal', description: 'Émulation VT100/xterm-256color complète avec support PTY et faible latence.' }, { title: 'Workflow orienté clavier', description: 'Raccourcis complets pour chaque action, sans dépendre de la souris.' }, { title: 'SFTP et redirection de ports', description: 'Navigateur SFTP intégré et redirection de ports sans outils supplémentaires.' }], testimonialsTitle: 'Adopté par des ingénieurs du monde entier', testimonialsSubtitle: 'Ce que les professionnels disent de DeepTerm', previousTestimonial: 'Témoignage précédent', nextTestimonial: 'Témoignage suivant', testimonialAria: 'Aller au témoignage', titleAt: 'chez', testimonials: [{ quote: 'DeepTerm a complètement transformé notre gestion des serveurs de production.', author: 'Sarah Chen', title: 'Lead DevOps Engineer', company: 'TechFlow Inc.' }, { quote: 'Enfin un client SSH vraiment natif sur macOS. Les performances sont excellentes.', author: 'Marcus Rodriguez', title: 'Senior Backend Developer', company: 'CloudScale Systems' }, { quote: 'La fonctionnalité de snippets à elle seule vaut le détour.', author: 'Emily Watson', title: 'System Administrator', company: 'DataVault Technologies' }, { quote: 'Le stockage dans le Trousseau macOS sans collecte de données nous rassure.', author: 'James Park', title: 'Security Engineer', company: 'SecureOps Global' }], ctaTitle: 'Prêt à moderniser votre workflow terminal ?', ctaSubtitle: 'Rejoignez des milliers d’ingénieurs déjà passés à DeepTerm.', ctaButton: 'Commencer gratuitement — sans carte bancaire' },
    adminLogin: { pageTitle: 'Connexion Admin', pageSubtitle: 'Accéder au panneau d’administration DeepTerm', emailLabel: 'E-mail', passwordLabel: 'Mot de passe', passwordPlaceholder: '••••••••', signIn: 'Se connecter', signingIn: 'Connexion en cours...', footerNotice: 'Zone protégée. Accès réservé aux administrateurs autorisés.', loginFailed: 'Échec de la connexion' },
  },
  es: {
    common: { language: 'Idioma', loading: 'Cargando...' },
    navbar: { product: 'Producto', overview: 'Resumen', features: 'Funciones', integrations: 'Integraciones', changelog: 'Novedades', security: 'Seguridad', pricing: 'Precios', enterprise: 'Empresa', login: 'Iniciar sesión', register: 'Registrarse', toggleMenu: 'Alternar menú' },
    footer: { tagline: 'El cliente SSH moderno para macOS con asistencia impulsada por IA.', product: 'Producto', resources: 'Recursos', company: 'Compañía', legal: 'Legal', documentation: 'Documentación', blog: 'Blog', helpCenter: 'Centro de ayuda', systemStatus: 'Estado del sistema', aboutUs: 'Sobre nosotros', careers: 'Carreras', contact: 'Contacto', termsOfUse: 'Términos de uso', privacy: 'Privacidad', download: 'Descargar', rightsReserved: 'Todos los derechos reservados.' },
    sidebar: { account: 'Cuenta', team: 'Equipo', vaults: 'Bóvedas', samlSso: 'SAML SSO', twoFactorAuth: 'Autenticación de dos factores', passkeys: 'Passkeys', billing: 'Facturación', forStudents: 'Para estudiantes', ideas: 'Ideas', getTheApp: 'Obtener la app', issues: 'Incidencias', securityAssessment: 'Evaluación de seguridad', helpFeedback: 'Ayuda y feedback', logOut: 'Cerrar sesión', expandSidebar: 'Expandir barra lateral', collapseSidebar: 'Contraer barra lateral' },
    home: { heroTitle: 'El cliente SSH moderno', heroTitleAccent: 'Creado para macOS', heroSubtitle: 'Conectividad SSH profesional con asistencia de IA, terminales divididos y rendimiento nativo de macOS.', getStartedFree: 'Empezar gratis', requestDemo: 'Solicitar demo', noSubscription: 'Sin suscripción', oneTimePurchase: 'Compra única', macosNative: 'Nativo para macOS', aiMessage: 'CPU alta detectada en el pid 4821 (api-gw). Este proceso consume 89% de CPU.', aiSuggestion: 'systemctl restart api-gateway', trustByline: 'Con la confianza de más de 10.000 ingenieros en', featuresTitle: 'Todo lo que necesitas para gestionar servidores', featuresSubtitle: 'DeepTerm combina emulación de terminal potente con productividad moderna en una interfaz nativa de macOS.', features: [{ title: 'Asistente de chat con IA', description: 'Chat de IA integrado en la barra lateral para comandos, administración y resolución de problemas.' }, { title: 'Bóvedas cifradas y llavero', description: 'Credenciales guardadas exclusivamente en el Llavero de macOS. Nunca en texto plano.' }, { title: 'Sincronización multiplataforma', description: 'Sincroniza hosts, snippets y sesiones entre macOS, Windows, Linux, iOS y Android.' }, { title: 'Terminal dividido avanzado', description: 'Divide el terminal horizontalmente para múltiples sesiones simultáneas.' }, { title: 'Snippets de comandos', description: 'Guarda comandos frecuentes para ejecución instantánea con un clic.' }, { title: 'Sesiones en múltiples pestañas', description: 'Abre sesiones SSH ilimitadas en pestañas con estado en tiempo real.' }], deepDiveTitle: 'Creado para profesionales', deepDiveSubtitle: 'Cada función está pensada para usuarios avanzados: rápida, fiable y elegante.', deepDiveFeatures: [{ title: 'Rendimiento nativo de macOS', description: 'Desarrollado desde cero para macOS con SwiftUI para una experiencia fluida.' }, { title: 'Emulación de terminal real', description: 'Emulación completa VT100/xterm-256color con soporte PTY y baja latencia.' }, { title: 'Flujo de trabajo centrado en teclado', description: 'Atajos completos para cada acción, sin tocar el ratón.' }, { title: 'SFTP y redirección de puertos', description: 'Navegador SFTP integrado y redirección de puertos sin herramientas extra.' }], testimonialsTitle: 'Querido por ingenieros de todo el mundo', testimonialsSubtitle: 'Lo que dicen los profesionales sobre DeepTerm', previousTestimonial: 'Testimonio anterior', nextTestimonial: 'Siguiente testimonio', testimonialAria: 'Ir al testimonio', titleAt: 'en', testimonials: [{ quote: 'DeepTerm transformó por completo cómo gestiono nuestros servidores de producción.', author: 'Sarah Chen', title: 'Lead DevOps Engineer', company: 'TechFlow Inc.' }, { quote: 'Por fin, un cliente SSH que se siente nativo en macOS. El rendimiento es increíble.', author: 'Marcus Rodriguez', title: 'Senior Backend Developer', company: 'CloudScale Systems' }, { quote: 'Solo la función de snippets ya lo vale. El equipo nuevo es productivo desde el primer día.', author: 'Emily Watson', title: 'System Administrator', company: 'DataVault Technologies' }, { quote: 'La seguridad era mi mayor preocupación. El almacenamiento en Llavero de macOS nos da tranquilidad.', author: 'James Park', title: 'Security Engineer', company: 'SecureOps Global' }], ctaTitle: '¿Listo para modernizar tu flujo de trabajo en terminal?', ctaSubtitle: 'Únete a miles de ingenieros que ya se cambiaron a DeepTerm.', ctaButton: 'Comienza gratis — sin tarjeta de crédito' },
    adminLogin: { pageTitle: 'Inicio de sesión de administrador', pageSubtitle: 'Accede al panel de administración de DeepTerm', emailLabel: 'Correo electrónico', passwordLabel: 'Contraseña', passwordPlaceholder: '••••••••', signIn: 'Iniciar sesión', signingIn: 'Iniciando sesión...', footerNotice: 'Área protegida. Acceso restringido solo a administradores autorizados.', loginFailed: 'Error de inicio de sesión' },
  },
};
