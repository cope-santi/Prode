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
  apiKey: "AIzaSyA6TsBSUUeL36WQ_m2wo_XhP8iwDaY0cFg",
  authDomain: "prode-mundial-2026-edmonton.firebaseapp.com",
  projectId: "prode-mundial-2026-edmonton",
  storageBucket: "prode-mundial-2026-edmonton.firebasestorage.app",
  messagingSenderId: "589928696658",
  appId: "1:589928696658:web:ea076e1ae37b22973b888b"
};

// Import firebaseConfig in your modules and initialize Firebase there.
