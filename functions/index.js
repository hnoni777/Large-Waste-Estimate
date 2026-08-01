const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

exports.onSharePostCreated = onDocumentCreated("shared_wastes/{docId}", async (event) => {
  const data = event.data.data();
  if (!data) return;

  const payload = {
    notification: {
      title: "새로운 폐가구 공유",
      body: data.memo ? (data.memo.length > 20 ? data.memo.substring(0, 20) + "..." : data.memo) : "새로운 폐가구가 등록되었습니다.",
      // icon: "/waste_app_icon_192.png" (webpush options below handle this better for PWA)
    },
    webpush: {
      notification: {
        icon: "/waste_app_icon_192.png",
        badge: "/waste_app_icon_192.png" // Small monochrome icon is ideal, but we'll use this for now
      },
      fcmOptions: {
        link: "/"
      }
    }
  };

  try {
    const tokensSnapshot = await db.collection("fcm_tokens").get();
    const tokens = [];
    tokensSnapshot.forEach(doc => {
      if (doc.data().token) {
        tokens.push(doc.data().token);
      }
    });

    if (tokens.length === 0) {
      console.log("No FCM tokens found.");
      return;
    }

    // FCM allows max 500 tokens per multicast
    const response = await admin.messaging().sendEachForMulticast({
      tokens: tokens,
      ...payload
    });

    console.log(`Successfully sent message: ${response.successCount} successes, ${response.failureCount} failures`);
    
    // Clean up failed tokens
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(tokens[idx]);
        }
      });
      console.log('Failed tokens:', failedTokens);
      // In a real app we might delete them from Firestore here
    }
  } catch (error) {
    console.error("Error sending push notification:", error);
  }
});
