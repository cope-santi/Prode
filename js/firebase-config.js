/**
 * Firebase Configuration Module
 *
 * Centralized Firebase configuration and initialization for all pages.
 * Use initFirebase() instead of duplicating initializeApp/getFirestore/getAuth.
 *
 * Usage:
 *   import { initFirebase } from './js/firebase-config.js';
 *   const { app, db, auth } = initFirebase();
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-app.js";
import { getFirestore, enableMultiTabIndexedDbPersistence } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth.js";

export const firebaseConfig = {
  apiKey: "AIzaSyA6TsBSUUeL36WQ_m2wo_XhP8iwDaY0cFg",
  authDomain: "prode-mundial-2026-edmonton.firebaseapp.com",
  projectId: "prode-mundial-2026-edmonton",
  storageBucket: "prode-mundial-2026-edmonton.firebasestorage.app",
  messagingSenderId: "589928696658",
  appId: "1:589928696658:web:ea076e1ae37b22973b888b"
};

let cached = null;

/**
 * Initialize Firebase once per document and turn on Firestore's IndexedDB cache.
 * Multi-tab persistence is used so the persistent shell's host page and its
 * iframe (same origin) can share the cache without fighting over the lock.
 * Falls back silently to network-only if the browser blocks storage.
 */
export function initFirebase() {
  if (cached) return cached;

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  enableMultiTabIndexedDbPersistence(db).catch(() => {
    /* unsupported browser / storage blocked -> keep working without local cache */
  });

  const auth = getAuth(app);
  cached = { app, db, auth };
  return cached;
}
