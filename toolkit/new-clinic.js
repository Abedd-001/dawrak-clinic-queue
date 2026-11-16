#!/usr/bin/env node
/*
  new-clinic.js — Setup script for a new Dawrak clinic
  ─────────────────────────────────────────────────────
  Asks for your Firebase project details, copies the template folder,
  and injects the config automatically — no manual find-and-replace.

  Usage:
    node new-clinic.js

  Prerequisites (do these in Firebase Console first):
    1) Create a new Firebase project for the clinic
    2) Enable Realtime Database
    3) Enable Authentication → Email/Password
    4) Add a user (email + password) for the doctor/receptionist
    5) Have the firebaseConfig ready (Project settings → Your apps → Web app)
*/

var fs = require('fs');
var path = require('path');
var readline = require('readline');

var rl = readline.createInterface({ input: process.stdin, output: process.stdout });

var waiting = null;
var queued = [];   // lines that arrive before the next question is asked (e.g. pasted text)

rl.on('line', function(line){
  if (waiting) { var w = waiting; waiting = null; w(line.trim()); }
  else queued.push(line.trim());
});

function ask(question, def){
  return new Promise(function(resolve){
    var suffix = def ? ' ['+def+']' : '';
    process.stdout.write(question + suffix + ': ');
    var done = function(answer){ resolve(answer || def || ''); };
    if (queued.length) { var a = queued.shift(); process.stdout.write(a + '\n'); done(a); }
    else waiting = done;
  });
}

function copyDir(src, dest){
  fs.mkdirSync(dest, { recursive: true });
  fs.readdirSync(src, { withFileTypes: true }).forEach(function(entry){
    if (entry.name === 'node_modules' || entry.name === '.git') return;
    var s = path.join(src, entry.name);
    var d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  });
}

function buildConfigBlock(cfg){
  return 'var FIREBASE_CONFIG = {\n'
    + '  apiKey:            "' + cfg.apiKey + '",\n'
    + '  authDomain:        "' + cfg.authDomain + '",\n'
    + '  databaseURL:       "' + cfg.databaseURL + '",\n'
    + '  projectId:         "' + cfg.projectId + '",\n'
    + '  storageBucket:     "' + cfg.storageBucket + '",\n'
    + '  messagingSenderId: "' + cfg.messagingSenderId + '",\n'
    + '  appId:             "' + cfg.appId + '"\n'
    + '};';
}

function applyConfig(filePath, cfg, clientUrl){
  var html = fs.readFileSync(filePath, 'utf8');
  html = html.replace(/var FIREBASE_CONFIG = \{[\s\S]*?\};/, buildConfigBlock(cfg));
  if (clientUrl !== null) {
    html = html.replace(/var CLIENT_URL = "[^"]*";/, 'var CLIENT_URL = "' + clientUrl + '";');
  }
  fs.writeFileSync(filePath, html);
}

async function main(){
  console.log('\n=== Dawrak — New Clinic Setup ===\n');

  var tpl = await ask('Clinic type: 1 = single doctor, 2 = multiple doctors', '1');
  var slug = await ask('Short clinic name in English (will be used as folder name, no spaces)', 'clinic2');
  console.log('\nEnter your Firebase project config (from Project settings → Your apps → Web app):\n');

  var cfg = {
    apiKey:            await ask('apiKey'),
    authDomain:        await ask('authDomain'),
    databaseURL:       await ask('databaseURL'),
    projectId:         await ask('projectId'),
    storageBucket:     await ask('storageBucket'),
    messagingSenderId: await ask('messagingSenderId'),
    appId:             await ask('appId')
  };

  var defaultClientUrl = cfg.projectId ? ('https://' + cfg.projectId + '.web.app/') : '';
  var clientUrl = await ask('Client page URL (CLIENT_URL)', defaultClientUrl);

  rl.close();

  if (!cfg.apiKey || !cfg.projectId) {
    console.log('\n⚠  apiKey and projectId are required. Please try again.');
    process.exit(1);
  }

  // This script lives inside the template folder itself (e.g. dawrak_real/).
  var templateDir = path.join(__dirname, 'templates', tpl === '2' ? 'mdorak' : 'dawrak');
  var destDir = path.join(__dirname, 'clinics', slug);
  if (fs.existsSync(destDir)) {
    console.log('\n⚠  clinics/' + slug + ' already exists. Delete it or choose a different name.');
    process.exit(1);
  }

  console.log('\nUsing template: ' + templateDir);
  console.log('Copying files to: ' + destDir + ' ...');
  copyDir(templateDir, destDir);

  // Remove this script from the new folder — not needed there
  var scriptCopy = path.join(destDir, 'new-clinic.js');
  if (fs.existsSync(scriptCopy)) fs.unlinkSync(scriptCopy);

  applyConfig(path.join(destDir, 'public', 'index.html'), cfg, null);
  applyConfig(path.join(destDir, 'public', 'staff', 'index.html'), cfg, clientUrl);
  applyConfig(path.join(destDir, 'public', 'display', 'index.html'), cfg, null);

  // .firebaserc
  fs.writeFileSync(
    path.join(destDir, '.firebaserc'),
    JSON.stringify({ projects: { default: cfg.projectId } }, null, 2) + '\n'
  );

  console.log('\n✅ Folder ready: ' + destDir);
  console.log('\nNext steps:');
  console.log('  cd ' + path.relative(process.cwd(), destDir));
  console.log('  firebase deploy');
  console.log('\nReminder: make sure you have enabled Realtime Database and Authentication (Email/Password),');
  console.log('added the doctor/receptionist user, and deployed the database rules before going live.\n');
  process.exit(0);
}

main();
