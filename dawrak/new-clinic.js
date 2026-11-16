#!/usr/bin/env node
/*
  new-clinic.js — سكريبت تجهيز عيادة جديدة
  ─────────────────────────────────────────
  بيسألك عن بيانات Firebase بتاعة العيادة الجديدة، وبينسخ الفولدر ده
  (dawrak_real) في فولدر جديد باسم العيادة، وبيحط الـconfig في الملفين
  أوتوماتيك بدل ما تدوّر وتلصق يدوي.

  الاستخدام:
    node new-clinic.js

  شرط: تكون عامل الخطوات دي في Firebase Console الأول:
    1) أنشأت مشروع Firebase جديد للعيادة
    2) فعّلت Realtime Database
    3) فعّلت Authentication → Email/Password
    4) ضفت يوزر (إيميل + باسورد) للدكتور/السكرتيرة
    5) عندك الـ firebaseConfig بتاع الـWeb App (من Project settings)
*/

var fs = require('fs');
var path = require('path');
var readline = require('readline');

var rl = readline.createInterface({ input: process.stdin, output: process.stdout });

var queue = [];
var waiting = null;

rl.on('line', function(line){
  if (waiting) {
    var w = waiting; waiting = null;
    w(line.trim());
  }
});

function ask(question, def){
  return new Promise(function(resolve){
    var suffix = def ? ' ['+def+']' : '';
    process.stdout.write(question + suffix + ': ');
    waiting = function(answer){ resolve(answer || def || ''); };
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
  console.log('\n=== تجهيز عيادة جديدة — دورك ===\n');

  var slug = await ask('اسم مختصر للعيادة بالإنجليزي (هيبقى اسم الفولدر، من غير مسافات)', 'clinic2');
  console.log('\nهات بيانات الـ Firebase Config بتاع العيادة (من Project settings → Your apps):\n');

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
  var clientUrl = await ask('رابط صفحة العميل (CLIENT_URL)', defaultClientUrl);

  rl.close();

  if (!cfg.apiKey || !cfg.projectId) {
    console.log('\n⚠ لازم تدخل apiKey و projectId على الأقل. جرّب تاني.');
    process.exit(1);
  }

  var here = __dirname;
  var destDir = path.join(path.dirname(here), slug);

  if (fs.existsSync(destDir)) {
    console.log('\n⚠ الفولدر "' + slug + '" موجود بالفعل جنب ده. امسحه أو اختار اسم تاني وجرّب تاني.');
    process.exit(1);
  }

  console.log('\nبنسخ الملفات لـ: ' + destDir + ' ...');
  copyDir(here, destDir);

  // امسح نسخة السكريبت ده من الفولدر الجديد (مش محتاجينه هناك)
  var scriptCopy = path.join(destDir, 'new-clinic.js');
  if (fs.existsSync(scriptCopy)) fs.unlinkSync(scriptCopy);

  applyConfig(path.join(destDir, 'public', 'index.html'), cfg, null);
  applyConfig(path.join(destDir, 'public', 'staff', 'index.html'), cfg, clientUrl);

  // .firebaserc
  fs.writeFileSync(
    path.join(destDir, '.firebaserc'),
    JSON.stringify({ projects: { default: cfg.projectId } }, null, 2) + '\n'
  );

  console.log('\n✅ الفولدر جاهز: ' + destDir);
  console.log('\nالخطوات الجاية:');
  console.log('  cd ' + path.relative(process.cwd(), destDir));
  console.log('  firebase deploy');
  console.log('\nمتنساش: تكون فعّلت Realtime Database و Authentication (Email/Password)،');
  console.log('وضفت يوزر الدكتور/السكرتيرة، ورفعت الـ rules، قبل الـ deploy.\n');
  process.exit(0);
}

main();
