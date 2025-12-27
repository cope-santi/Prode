/**
 * Firebase Configuration Module
 * 
 * Centralized Firebase configuration for all pages
 * Import this module instead of duplicating config in each HTML file
 * 
 * Usage:
 *   import { firebaseConfig, initializeFirebase } from './js/firebase-config.js';
 *   const { app, db, auth } = initializeFirebase();
 */

export const firebaseConfig = {
  apiKey: "AIzaSyDiXK6wk760_u0L-wQVjM2ekw2pr74byrc",
  authDomain: "mundial2026-9d7da.firebaseapp.com",
  projectId: "mundial2026-9d7da",
  storageBucket: "mundial2026-9d7da.firebasestorage.app",
  messagingSenderId: "909132807014",
  appId: "1:909132807014:web:e837af32356a105891a6a7"
};

/**
 * Initialize Firebase and return app, db, and auth instances
 * Must be called after importing Firebase SDK modules
 * 
 * @returns {Object} Object containing { app, db, auth }
 */
export function initializeFirebase() {
    // These must be imported in the calling module before calling this function
    // Example:
    //   import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
    //   import { getFirestore } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
    //   import { getAuth } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
    //   import { firebaseConfig, initializeFirebase } from "./js/firebase-config.js";
    
    throw new Error('initializeFirebase() is deprecated. Import Firebase modules directly and use firebaseConfig instead.');
}

/**
 * Helper to initialize Firebase in a module script
 * Returns an initialization function that the calling module should use
 * 
 * Usage in your module:
 *   import { firebaseConfig } from './js/firebase-config.js';
 *   import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
 *   import { getFirestore } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
 *   import { getAuth } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";
 *   
 *   const app = initializeApp(firebaseConfig);
 *   const db = getFirestore(app);
 *   const auth = getAuth(app);
 */
