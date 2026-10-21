import base from './playwright.config';
export default { ...base, projects: [{ name: 'firefox', use: { ...base.projects![1].use, launchOptions: { firefoxUserPrefs: { 'webgl.disabled': true } } } }] };
