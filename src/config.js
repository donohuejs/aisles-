  const productionFirebaseConfig = {
    apiKey: "AIzaSyArDBKW5qdUVs-NsYbtplVqkTW49HOvw5w",
    authDomain: "aisles-f3a4c.firebaseapp.com",
    projectId: "aisles-f3a4c",
    storageBucket: "aisles-f3a4c.firebasestorage.app",
    messagingSenderId: "814799394672",
    appId: "1:814799394672:web:772878c89587f2fd0be1b5"
  };

  const uatFirebaseConfig = {
    apiKey: "AIzaSyB9s4Rmsicaw6HkOjvzW6X6EosXORPXQEU",
    authDomain: "uat-aisles.firebaseapp.com",
    projectId: "uat-aisles",
    storageBucket: "uat-aisles.firebasestorage.app",
    messagingSenderId: "384777489395",
    appId: "1:384777489395:web:daf88a6c028a99fcf3a086"
  };

  // UAT Hosting, a future uat.* custom domain, and local development all use
  // the isolated UAT database. Every other hostname continues to use production.
  const hostname = window.location.hostname.toLowerCase();
  export const isUatEnvironment =
    hostname === 'uat-aisles.web.app' ||
    hostname === 'uat-aisles.firebaseapp.com' ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.startsWith('uat.');
  export const firebaseConfig = isUatEnvironment ? uatFirebaseConfig : productionFirebaseConfig;
