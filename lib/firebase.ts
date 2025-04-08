import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyBjVJO1pglUBr_5kkKoMAvDd1AQXAVZcpA",
  authDomain: "song-demo-d9a7a.firebaseapp.com",
  databaseURL: "https://song-demo-d9a7a-default-rtdb.firebaseio.com",
  projectId: "song-demo-d9a7a",
  storageBucket: "song-demo-d9a7a.firebasestorage.app",
  messagingSenderId: "941977233141",
  appId: "1:941977233141:android:e14334be3b54d12d3e87bc"
};

const app = initializeApp(firebaseConfig);
export const database = getDatabase(app); 