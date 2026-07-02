import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, updateDoc, doc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDZOTF9pL9Gsqjdjz-MHT7XNnSp3Uh2Xj0",
  authDomain: "aura-27aa5.firebaseapp.com",
  projectId: "aura-27aa5",
  storageBucket: "aura-27aa5.firebasestorage.app",
  messagingSenderId: "467500304444",
  appId: "1:467500304444:web:0822bb73924596fc30db39"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function migrateTeams() {
  console.log("Starting migration...");
  const querySnapshot = await getDocs(collection(db, "shared_wastes"));
  let count = 0;
  
  for (const document of querySnapshot.docs) {
    const data = document.data();
    if (!data.team) {
      await updateDoc(doc(db, "shared_wastes", document.id), {
        team: "0258"
      });
      count++;
    }
  }
  
  console.log(`Migration complete! Updated ${count} documents.`);
  process.exit();
}

migrateTeams();
