import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";

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

async function analyze() {
  const docRef = doc(db, 'pickups', 'master_excel_data');
  const docSnap = await getDoc(docRef);
  
  if (docSnap.exists()) {
    const data = docSnap.data();
    const rows = data.allParsedData || [];
    
    const baseAddressCounts = {};
    const baseToDongMap = {};
    
    rows.forEach(row => {
      const address = (row['주소'] || '').trim();
      const detail = (row['상세위치'] || '').trim();
      
      const combined = `${address} ${detail}`;
      
      const dongMatch = combined.match(/(?:^|\s)([0-9]+[-a-zA-Z0-9]*\s*동)(?:\s|$)/);
      
      if (dongMatch) {
        let baseAddr = address.replace(/\s*\d+호\s*/g, '')
                              .replace(/\([^)]+\)/g, '')
                              .trim();
        
        // Remove the dong directly
        baseAddr = baseAddr.replace(dongMatch[1], '').trim();
        // Remove any other loose '동' or standalone numbers
        baseAddr = baseAddr.replace(/\s+[0-9]+[-a-zA-Z0-9]*\s*동\b/g, '');
        
        baseAddr = baseAddr.replace(/\s+/g, ' ').trim();

        if (!baseAddressCounts[baseAddr]) {
           baseAddressCounts[baseAddr] = 0;
           baseToDongMap[baseAddr] = new Set();
        }
        baseAddressCounts[baseAddr]++;
        baseToDongMap[baseAddr].add(dongMatch[1]);
      }
    });
    
    const sorted = Object.entries(baseAddressCounts).sort((a, b) => b[1] - a[1]);
    
    console.log("=== 자주 등장하는 아파트 추정 주소 TOP 15 ===");
    sorted.slice(0, 15).forEach(([addr, count]) => {
      console.log(`- ${addr} (등장 횟수: ${count}건)`);
      console.log(`  └ 예시 동: ${Array.from(baseToDongMap[addr]).slice(0, 5).join(', ')}`);
    });
    
  } else {
    console.log("No data found!");
  }
  process.exit();
}

analyze();
