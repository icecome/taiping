// Entry point for browser builds
import OverType from './overtype.js';

export default OverType;

// Re-export markdown-actions + toolbar buttons so the host app can build a
// custom toolbar that drives the same formatting pipeline as the built-in one.
export { markdownActions, toolbarButtons, defaultToolbarButtons } from './overtype.js';