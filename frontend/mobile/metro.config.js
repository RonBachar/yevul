// הגדרת Metro למונוריפו, לפי התיעוד הרשמי של Expo. נחוץ כי הפותר
// המובנה של Metro לא עולה מעל תיקיית האפליקציה כדי למצוא node_modules
// שמורמים לשורש המונוריפו (כמו React Navigation) או חבילות פנימיות
// כמו @yevul/shared, אז צריך להצביע לו במפורש גם על node_modules של
// השורש וגם על כל קבצי המונוריפו למעקב (watchFolders).
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
