// הגדרת Metro למונוריפו, לפי התיעוד הרשמי של Expo. נחוץ כי node_modules
// מורמים לשורש המונוריפו, ו-expo-router (require.context) חייב שהפותר
// יראה גם את node_modules של השורש וגם יעקוב אחרי קבצי כל המונוריפו.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// עקוב אחרי כל המונוריפו, כדי ש-@yevul/shared וחבילות פנימיות ייקלטו
config.watchFolders = [workspaceRoot];

// פתור חבילות גם מ-node_modules המקומי וגם מזה של השורש
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

module.exports = config;
