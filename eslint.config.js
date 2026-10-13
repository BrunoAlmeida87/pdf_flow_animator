// ESLint (flat config). O app usa <script> clássicos: cada arquivo de js/ declara globais
// usados pelos outros — listados abaixo para no-undef pegar nomes inexistentes (ex.: o antigo
// this.hideCursorPreviews era propriedade, mas um helper global com typo seria pego aqui).
const globals = require('globals');

const appGlobals = {
    // i18n.js / util.js / modal.js / ui.js
    I18N: 'readonly', t: 'readonly', getLang: 'readonly', applyI18n: 'readonly',
    Util: 'readonly', escapeHtml: 'readonly', insertEmoji: 'readonly',
    showConfirm: 'readonly', showAlertModal: 'readonly', showPromptModal: 'readonly', showFormModal: 'readonly',
    showCustomModal: 'readonly', isModalOpen: 'readonly',
    Toast: 'readonly', Menus: 'readonly', DragHint: 'readonly', Progress: 'readonly',
    // zip.js / gif.js / storage.js / audio.js / geometry.js
    ZipBuilder: 'readonly', GifEncoder: 'readonly', ProjectStore: 'readonly', AudioEngine: 'readonly', Geometry: 'readonly',
    // timeline-pro.js / flow-animator.js (+ fa-*.js) / inspector.js / main.js
    TimelinePro: 'readonly', FlowAnimator: 'readonly', ProjectSchema: 'readonly', Inspector: 'readonly',
    flowAnimator: 'writable', Theme: 'readonly',
    // vendor
    pdfjsLib: 'readonly', PerfectFreehand: 'readonly', Mediabunny: 'readonly'
};

module.exports = [
    {
        files: ['js/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            globals: { ...globals.browser, ...appGlobals }
        },
        rules: {
            'no-undef': 'error',
            'no-dupe-class-members': 'error',
            'no-dupe-keys': 'error',
            'no-redeclare': ['error', { builtinGlobals: false }],
            'no-unused-vars': ['warn', { vars: 'local', args: 'none', caughtErrors: 'none' }],
            'no-unreachable': 'error',
            'no-self-assign': 'error',
            'no-constant-condition': ['error', { checkLoops: false }],
            'no-fallthrough': 'error',
            'no-useless-escape': 'warn',
            'prefer-const': 'warn'
        }
    },
    {
        files: ['tests/**/*.js', 'scripts/**/*.js', '*.config.js', 'eslint.config.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: { ...globals.node, ...globals.browser }
        },
        rules: {
            'no-undef': 'error',
            'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }]
        }
    },
    { ignores: ['vendor/**', 'node_modules/**', 'test-results/**', 'playwright-report/**'] }
];
