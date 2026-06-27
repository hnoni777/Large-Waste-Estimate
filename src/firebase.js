import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDZOTF9pL9Gsqjdjz-MHT7XNnSp3Uh2Xj0",
  authDomain: "aura-27aa5.firebaseapp.com",
  projectId: "aura-27aa5",
  storageBucket: "aura-27aa5.firebasestorage.app",
  messagingSenderId: "467500304444",
  appId: "1:467500304444:web:0822bb73924596fc30db39",
  measurementId: "G-K6RD370CD2"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
