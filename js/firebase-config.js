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

// Import firebaseConfig in your modules and initialize Firebase there.
