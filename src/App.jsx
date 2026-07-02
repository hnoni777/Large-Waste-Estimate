import { useState, useMemo, useEffect } from 'react'
import data from '../data.json'
import * as XLSX from 'xlsx'


const APT_MAPPING = {
  "오리로 801": "e편한세상 센트레빌",
  "도덕공원로 35": "브라운스톤 2차",
  "안현로 34": "하안주공 3단지",
  "도덕공원로 59": "푸르지오",
  "가림일로 101": "도덕파크 2단지",
  "안현로 15": "하안주공 1단지",
  "가림일로 79": "도덕파크 1단지",
  "안현로 36": "하안주공 4단지",
  "가림로 38": "하안주공 5단지",
  "안현로 35": "하안주공 2단지",
  "광덕산로 26": "두산위브",
  "가림일로 55": "현대아파트"
};

const getAptName = (address) => {
  if (!address) return null;
  // 주소에서 동, 호, 괄호 등 불필요한 부분 제거하여 매핑 키와 비교하기 쉽게 정제
  let cleanAddr = address.replace(/\s*\d+호\s*/g, '')
                         .replace(/\([^)]+\)/g, '');
  cleanAddr = cleanAddr.replace(/(?:^|\s)([0-9]+[-a-zA-Z0-9]*\s*동)(?:\s|$)/g, '');
  cleanAddr = cleanAddr.replace(/\s+/g, ' ').trim();

  for (const [key, apt] of Object.entries(APT_MAPPING)) {
    if (cleanAddr.includes(key)) {
      return apt;
    }
  }
  return null;
};
import { db } from './firebase'
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore'
import './index.css'

function App() {
  const [activeTab, setActiveTab] = useState('search') // 'search', 'cart', 'status'
  const [searchTerm, setSearchTerm] = useState('')
  const [cart, setCart] = useState([])
  
  // 배출현황 관련 상태
  const [allParsedData, setAllParsedData] = useState([])
  const [availableDates, setAvailableDates] = useState([])
  const [selectedDates, setSelectedDates] = useState([])
  const [fileName, setFileName] = useState('')
  const [updatedAt, setUpdatedAt] = useState(null)
  
  // 캘린더 공용 상태
  const [calendarMode, setCalendarMode] = useState('status') // 'status' | 'share'
  
  // 접수현황 내 검색 상태
  const [statusSearchTerm, setStatusSearchTerm] = useState('')
  const [statusSort, setStatusSort] = useState('dateDesc')
  
  // 캘린더 팝업 상태
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(new Date())

  // 앱 실행 시 저장된 엑셀 데이터 불러오기 및 서버 실시간 동기화
  useEffect(() => {
    // 1. 초기 로딩을 빠르게 하기 위해 로컬 스토리지 캐시 적용
    const savedData = localStorage.getItem('waste_app_data');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setAllParsedData(parsed.allParsedData || []);
        setAvailableDates(parsed.availableDates || []);
        setFileName(parsed.fileName || '');
        setUpdatedAt(parsed.updatedAt || null);
        
        const dt = new Date();
        const todayStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        const ydt = new Date(dt);
        ydt.setDate(ydt.getDate() - 1);
        const yesterdayStr = `${ydt.getFullYear()}-${String(ydt.getMonth() + 1).padStart(2, '0')}-${String(ydt.getDate()).padStart(2, '0')}`;
        
        let datesArr = parsed.availableDates || [];
        if (!datesArr.includes(todayStr)) datesArr.push(todayStr);
        if (!datesArr.includes(yesterdayStr)) datesArr.push(yesterdayStr);
        datesArr.sort().reverse();
        setAvailableDates(datesArr);
        
        const defaultDates = [todayStr, yesterdayStr];
        setSelectedDates(prev => prev.length === 0 ? defaultDates : prev);
        setCurrentMonth(new Date());
      } catch (e) {
        console.error("Failed to parse saved excel data", e);
      }
    }

    // 2. 파이어베이스에서 실시간 마스터 데이터 감시 (다른 기기에서 올린 엑셀 연동)
    const unsub = onSnapshot(doc(db, 'pickups', 'master_excel_data'), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        
        setAllParsedData(data.allParsedData || []);
        const dt = new Date();
        const todayStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        const ydt = new Date(dt);
        ydt.setDate(ydt.getDate() - 1);
        const yesterdayStr = `${ydt.getFullYear()}-${String(ydt.getMonth() + 1).padStart(2, '0')}-${String(ydt.getDate()).padStart(2, '0')}`;
        
        let datesArr = data.availableDates || [];
        if (!datesArr.includes(todayStr)) datesArr.push(todayStr);
        if (!datesArr.includes(yesterdayStr)) datesArr.push(yesterdayStr);
        datesArr.sort().reverse();
        
        setAvailableDates(datesArr);
        setFileName(data.fileName || '');
        setUpdatedAt(data.updatedAt || null);
        
        // 새로운 데이터로 로컬 캐시 덮어쓰기
        localStorage.setItem('waste_app_data', JSON.stringify(data));
        
        // 날짜 초기화 (무조건 오늘과 어제 선택)
        const defaultDates = [todayStr, yesterdayStr];
        setSelectedDates(prev => prev.length === 0 ? defaultDates : prev);
        setCurrentMonth(new Date());
      }
    });

    return () => unsub();
  }, []);

  // 파이어베이스 실시간 수거 상태 및 사진
  const [pickupStatuses, setPickupStatuses] = useState({})
  const [uploadingImages, setUploadingImages] = useState({}) // { [id_type]: boolean }
  const [fullScreenData, setFullScreenData] = useState({ images: [], currentIndex: 0 })
  const [optimisticImages, setOptimisticImages] = useState({});
  const [touchStart, setTouchStart] = useState(null);
  const [touchEnd, setTouchEnd] = useState(null);

  const onTouchStart = (e) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };
  const onTouchMove = (e) => setTouchEnd(e.targetTouches[0].clientX);
  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;
    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;
    if (isLeftSwipe && fullScreenData.images.length > 1) {
      setFullScreenData(prev => ({
        ...prev,
        currentIndex: prev.currentIndex < prev.images.length - 1 ? prev.currentIndex + 1 : 0
      }));
    }
    if (isRightSwipe && fullScreenData.images.length > 1) {
      setFullScreenData(prev => ({
        ...prev,
        currentIndex: prev.currentIndex > 0 ? prev.currentIndex - 1 : prev.images.length - 1
      }));
    }
  };

  const IMGBB_API_KEY = '26dd27a0bfb51ce28f2ff4d54c833979';

  useEffect(() => {
    // pickups 컬렉션 실시간 구독
    const unsubscribe = onSnapshot(collection(db, 'pickups'), (snapshot) => {
      const statusMap = {};
      snapshot.forEach(doc => {
        statusMap[doc.id] = doc.data();
      });
      setPickupStatuses(statusMap);
    }, (error) => {
      console.error("Firebase listen error:", error);
    });

    return () => unsubscribe();
  }, []);

  // 폐가구공유 상태 및 리스너
  const [sharedWastes, setSharedWastes] = useState([]);
  const [isShareWriting, setIsShareWriting] = useState(false);
  const [editingShareId, setEditingShareId] = useState(null);
  const [sharePhotos, setSharePhotos] = useState([]); // array of { id, url, isUploading }
  const [shareMemo, setShareMemo] = useState(''); // 메모 상태 추가
  const [shareSelectedDates, setShareSelectedDates] = useState([]);
  const [shareDate, setShareDate] = useState(() => {
    const dt = new Date();
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  });

  const shareAvailableDates = useMemo(() => {
    const dates = new Set();
    const dt = new Date();
    const todayStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    dates.add(todayStr);
    
    const ydt = new Date(dt);
    ydt.setDate(ydt.getDate() - 1);
    const yesterdayStr = `${ydt.getFullYear()}-${String(ydt.getMonth() + 1).padStart(2, '0')}-${String(ydt.getDate()).padStart(2, '0')}`;
    dates.add(yesterdayStr);

    sharedWastes.forEach(item => {
      let dateStr = item.date;
      if (!dateStr && item.createdAt) {
        const d = new Date(item.createdAt);
        dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
      if (dateStr) dates.add(dateStr);
    });
    return Array.from(dates).sort().reverse();
  }, [sharedWastes]);

  useEffect(() => {
    setShareSelectedDates(prev => {
      const isValid = prev.length > 0 && prev.every(d => shareAvailableDates.includes(d));
      if (!isValid && shareAvailableDates.length > 0) {
        const dt = new Date();
        const todayStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        const ydt = new Date(dt);
        ydt.setDate(ydt.getDate() - 1);
        const yesterdayStr = `${ydt.getFullYear()}-${String(ydt.getMonth() + 1).padStart(2, '0')}-${String(ydt.getDate()).padStart(2, '0')}`;
        
        return [todayStr, yesterdayStr];
      }
      return prev;
    });
  }, [shareAvailableDates]);

  useEffect(() => {
    const unsubscribeShare = onSnapshot(collection(db, 'shared_wastes'), (snapshot) => {
      const wastes = [];
      snapshot.forEach(doc => {
        wastes.push({ id: doc.id, ...doc.data() });
      });
      wastes.sort((a, b) => b.createdAt - a.createdAt);
      setSharedWastes(wastes);
    });
    return () => unsubscribeShare();
  }, []);

  // 뒤로가기(History) 라우팅 처리
  useEffect(() => {
    window.history.replaceState({ type: 'tab', tab: 'search' }, '');

    const handlePopState = (e) => {
      const state = e.state;
      if (fullScreenData.images.length > 0) {
        setFullScreenData({ images: [], currentIndex: 0 });
      } else if (isCalendarOpen) {
        setIsCalendarOpen(false);
      } else if (isShareWriting) {
        setIsShareWriting(false);
      } else if (state && state.type === 'tab') {
        setActiveTab(state.tab);
      } else {
        setActiveTab('search');
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [fullScreenData, isCalendarOpen, isShareWriting]);

  const handleTabChange = (tab) => {
    if (activeTab === tab) return;
    window.history.pushState({ type: 'tab', tab: tab }, '');
    setActiveTab(tab);
  };

  const openCalendar = (mode = 'status') => {
    setCalendarMode(mode);
    window.history.pushState({ type: 'modal', modal: 'calendar' }, '');
    setIsCalendarOpen(true);
  };

  const closeCalendar = () => {
    if (isCalendarOpen) window.history.back();
  };

  const openShareWrite = () => {
    setEditingShareId(null);
    setSharePhotos([]);
    setShareMemo('');
    window.history.pushState({ type: 'modal', modal: 'shareWrite' }, '');
    setIsShareWriting(true);
  };

  const editSharePost = (waste) => {
    setEditingShareId(waste.id);
    setSharePhotos(waste.photos ? waste.photos.map((url, i) => ({ id: `old_${i}`, url, isUploading: false })) : []);
    setShareMemo(waste.memo || '');
    window.history.pushState({ type: 'modal', modal: 'shareWrite' }, '');
    setIsShareWriting(true);
  };

  const closeShareWrite = () => {
    if (isShareWriting) window.history.back();
  };

  const openFullScreen = (images, index) => {
    window.history.pushState({ type: 'modal', modal: 'fullscreen' }, '');
    setFullScreenData({ images, currentIndex: index });
  };

  const closeFullScreen = () => {
    if (fullScreenData.images.length > 0) window.history.back();
  };

  const toggleComplete = async (id, currentStatus) => {
    try {
      await setDoc(doc(db, 'pickups', id), {
        completed: !currentStatus
      }, { merge: true });
    } catch (e) {
      console.error('Error updating status: ', e);
    }
  };

  const handleCopyId = (id) => {
    navigator.clipboard.writeText(id).catch(err => {
      console.error('Failed to copy', err);
    });
  };

  // 💡 사진 업로드 속도를 비약적으로 높여주는 하드웨어 가속 압축 함수
  const compressImage = async (file, maxWidth = 800) => {
    if (window.createImageBitmap) {
      try {
        const bitmap = await createImageBitmap(file);
        let width = bitmap.width;
        let height = bitmap.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(bitmap, 0, 0, width, height);
        bitmap.close(); 
        return new Promise((resolve, reject) => {
          canvas.toBlob((blob) => {
            if (!blob) reject(new Error("Canvas is empty"));
            resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
          }, 'image/jpeg', 0.7); 
        });
      } catch (e) {
        console.warn("createImageBitmap failed, falling back to FileReader", e);
      }
    }
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          canvas.toBlob((blob) => {
            if (!blob) reject(new Error("Canvas is empty"));
            resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
          }, 'image/jpeg', 0.7); 
        };
        img.onerror = (err) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  const handleImageUpload = async (e, pickupId, type) => {
    const file = e.target.files[0];
    if (!file) return;

    const uploadKey = `${pickupId}_${type}`;
    const localUrl = URL.createObjectURL(file);
    
    // 즉각적인 피드백을 위한 낙관적 UI 적용
    setOptimisticImages(prev => ({ ...prev, [uploadKey]: localUrl }));
    setUploadingImages(prev => ({ ...prev, [uploadKey]: true }));

    try {
      const compressedFile = await compressImage(file, 600);

      const formData = new FormData();
      formData.append('image', compressedFile);
      
      const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      
      if (data.success) {
        const imageUrl = data.data.url;
        await setDoc(doc(db, 'pickups', pickupId), {
          [type + 'Image']: imageUrl
        }, { merge: true });
      } else {
        alert("이미지 업로드에 실패했습니다.");
      }
    } catch (err) {
      console.error("Upload error", err);
      alert("이미지 업로드 중 오류가 발생했습니다.");
    } finally {
      setUploadingImages(prev => ({ ...prev, [uploadKey]: false }));
      // 백그라운드 업로드가 끝났으므로 실제 Firestore URL 렌더링으로 넘김
      setOptimisticImages(prev => {
        const next = { ...prev };
        delete next[uploadKey];
        return next;
      });
    }
  };

  const deleteImage = async (e, pickupId, type) => {
    e.stopPropagation();
    if (!window.confirm('이 사진을 삭제하시겠습니까?')) return;
    try {
      await setDoc(doc(db, 'pickups', pickupId), {
        [type + 'Image']: ""
      }, { merge: true });
    } catch (err) {
      console.error("Delete error", err);
    }
  };

  const handleSharePhotoUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    e.target.value = ''; // Reset input
    
    for (const file of files) {
      const localUrl = URL.createObjectURL(file);
      const tempId = Date.now() + Math.random();
      
      // 즉시 UI 반영 (Optimistic UI)
      setSharePhotos(prev => [...prev, { id: tempId, url: localUrl, isUploading: true }]);
      
      // 백그라운드 비동기 업로드 (await 없이 실행)
      (async () => {
        try {
          const compressedFile = await compressImage(file, 600);
          const formData = new FormData();
          formData.append('image', compressedFile);
          
          const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
            method: 'POST',
            body: formData
          });
          const data = await res.json();
          if (data.success) {
            setSharePhotos(prev => prev.map(p => p.id === tempId ? { ...p, url: data.data.url, isUploading: false } : p));
          } else {
            setSharePhotos(prev => prev.filter(p => p.id !== tempId));
          }
        } catch (err) {
          console.error("Share photo upload error", err);
          // 실패 시 임시 이미지 제거
          setSharePhotos(prev => prev.filter(p => p.id !== tempId));
        }
      })();
    }
  };

  const removeSharePhoto = (index) => {
    setSharePhotos(prev => prev.filter((_, i) => i !== index));
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      alert("이 기기에서는 위치 정보를 지원하지 않습니다.");
      return;
    }
    navigator.geolocation.getCurrentPosition((position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      window.open(`https://m.map.naver.com/map.naver?lat=${lat}&lng=${lng}&dlevel=16`, "_blank");
    }, (error) => {
      alert("위치 정보를 가져오는데 실패했습니다. 폰의 GPS(위치) 설정이 켜져있는지 확인해주세요.");
    }, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    });
  };

  const submitSharePost = async () => {
    if (sharePhotos.length === 0) {
      alert("사진을 1장 이상 추가해주세요.");
      return;
    }
    if (sharePhotos.some(p => p.isUploading)) {
      alert("사진 업로드가 진행 중입니다. 잠시만 기다려주세요.");
      return;
    }

    const finalUrls = sharePhotos.map(p => p.url);

    try {
      if (editingShareId) {
        await setDoc(doc(db, 'shared_wastes', editingShareId), {
          photos: finalUrls,
          memo: shareMemo.trim()
        }, { merge: true });
      } else {
        const newDocRef = doc(collection(db, 'shared_wastes'));
        await setDoc(newDocRef, {
          photos: finalUrls,
          createdAt: Date.now(),
          date: shareDate,
          memo: shareMemo.trim(),
          completed: false
        });
      }
      setSharePhotos([]);
      setShareMemo('');
      setEditingShareId(null);
      window.history.back();
    } catch (e) {
      console.error("Error adding shared waste", e);
      alert("업로드에 실패했습니다.");
    }
  };

  const toggleShareComplete = async (id, currentStatus) => {
    try {
      await setDoc(doc(db, 'shared_wastes', id), {
        completed: !currentStatus,
        completedAt: !currentStatus ? Date.now() : null
      }, { merge: true });
    } catch (e) {
      console.error('Error updating share status: ', e);
    }
  };

  const deleteSharedPost = async (id) => {
    if (!window.confirm("이 공유 게시물(사진)을 완전히 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, 'shared_wastes', id));
    } catch (e) {
      console.error("Error deleting post: ", e);
      alert("삭제에 실패했습니다.");
    }
  };

  const deleteSingleSharePhoto = async (id, currentPhotos, indexToDelete) => {
    if (!window.confirm("이 사진을 삭제하시겠습니까?")) return;
    const newPhotos = currentPhotos.filter((_, i) => i !== indexToDelete);
    try {
      if (newPhotos.length === 0) {
        // 사진이 하나도 남지 않게 되면 게시물 전체를 삭제
        await deleteDoc(doc(db, 'shared_wastes', id));
      } else {
        await setDoc(doc(db, 'shared_wastes', id), {
          photos: newPhotos
        }, { merge: true });
      }
    } catch (e) {
      console.error("Error deleting single photo: ", e);
      alert("사진 삭제에 실패했습니다.");
    }
  };

  const filteredSharedWastes = useMemo(() => {
    return sharedWastes.filter(waste => {
      let dateStr = waste.date;
      if (!dateStr && waste.createdAt) {
        const d = new Date(waste.createdAt);
        dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
      return shareSelectedDates.includes(dateStr);
    });
  }, [sharedWastes, shareSelectedDates]);

  const items = useMemo(() => {
    return data.map((d, index) => ({
      id: `${d['품목']}_${d['규격']}_${index}`,
      item: d['품목'],
      spec: d['규격'],
      price: Number(d['비용']) || 0
    }))
  }, [])

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return items
    const lower = searchTerm.toLowerCase()
    return items.filter(
      (i) => (i.item && i.item.toLowerCase().includes(lower)) || 
             (i.spec && i.spec.toLowerCase().includes(lower))
    )
  }, [searchTerm, items])

  const addToCart = (itemObj) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.id === itemObj.id)
      if (existing) {
        return prev.map((c) =>
          c.id === itemObj.id ? { ...c, qty: c.qty + 1 } : c
        )
      }
      return [...prev, { ...itemObj, qty: 1 }]
    })
  }

  const updateQty = (id, delta) => {
    setCart((prev) =>
      prev.map((c) => {
        if (c.id === id) {
          const newQty = c.qty + delta
          return { ...c, qty: newQty > 0 ? newQty : 1 }
        }
        return c
      })
    )
  }

  const removeFromCart = (id) => {
    setCart((prev) => prev.filter((c) => c.id !== id))
  }

  const totalCost = useMemo(() => {
    return cart.reduce((sum, c) => sum + c.price * c.qty, 0)
  }, [cart])

  const cartItemsCount = cart.reduce((sum, c) => sum + c.qty, 0)

  // 엑셀 파일 업로드 핸들러
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target.result;
      const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const parsedData = XLSX.utils.sheet_to_json(ws);
      
      const datesSet = new Set();
      const enrichedData = [];

      // 💥 서버 용량 초과 방지를 위해 '최근 30일' 데이터만 필터링 💥
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 30);
      cutoffDate.setHours(0, 0, 0, 0); // 30일 전 자정 기준

      parsedData.forEach(row => {
        const d = row['신청일자'];
        // 날짜 객체이고, 30일 전보다 이후(최근) 데이터인 경우에만 추가
        if (d instanceof Date && d >= cutoffDate) {
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          const dateStr = `${yyyy}-${mm}-${dd}`;
          
          datesSet.add(dateStr);
          enrichedData.push({ ...row, _dateStr: dateStr });
        }
      });

      const datesArr = Array.from(datesSet).sort().reverse(); // 최근 날짜가 먼저 오게 정렬
      
      const rawDataToSave = {
        allParsedData: enrichedData,
        availableDates: datesArr,
        fileName: file.name,
        updatedAt: Date.now()
      };

      // 파이어베이스는 undefined를 허용하지 않으므로 JSON 변환으로 깔끔하게 정리 (크기 최적화 포함)
      const dataToSave = JSON.parse(JSON.stringify(rawDataToSave));

      // 1. 파이어베이스에 업로드 (권한 문제가 없도록 기존에 잘 쓰던 pickups 컬렉션 사용)
      setDoc(doc(db, 'pickups', 'master_excel_data'), dataToSave)
        .then(() => {
          alert('✅ 엑셀 명단이 서버에 성공적으로 전송되었습니다!\n이제 서버에서 명단을 불러옵니다.');
          // 전송 성공 시 입력창 초기화 (같은 파일 다시 올릴 수 있도록)
          e.target.value = '';
        })
        .catch(err => {
          console.error('엑셀 업데이트 실패:', err);
          alert('❌ 서버 업로드에 실패했습니다. (사유: ' + err.message + ')');
          e.target.value = '';
        });
        
      // 주의: 여기서 직접 화면(state)을 갱신하지 않습니다.
      // 서버에 전송되면 useEffect의 onSnapshot이 새 데이터를 감지하고 화면을 갱신합니다.
      // (이것이 사용자가 원하는 "서버에 올리고 -> 서버에서 불러오기" 로직입니다.)
    };
    reader.readAsBinaryString(file);
  };

  const toggleDate = (dateStr) => {
    if (calendarMode === 'share') {
      setShareSelectedDates(prev => {
        if (prev.includes(dateStr)) {
          return prev.filter(d => d !== dateStr);
        } else {
          return [...prev, dateStr].sort().reverse();
        }
      });
    } else {
      setSelectedDates(prev => {
        if (prev.includes(dateStr)) {
          return prev.filter(d => d !== dateStr);
        } else {
          return [...prev, dateStr].sort().reverse();
        }
      });
    }
  };

  // 선택된 날짜별로 그룹핑하고, 그 안에서 다시 배출번호로 그룹핑 (검색어가 있으면 전체 날짜에서 검색)
  const statusDataByDate = useMemo(() => {
    const term = statusSearchTerm.trim().toLowerCase();
    
    let filtered = allParsedData;
    if (term) {
      const searchTarget = term.replace(/\s+/g, '');
      filtered = allParsedData.filter(row => {
        const name = (row['신청자'] || row['성명'] || row['신청인'] || row['이름'] || row['성명(법인명)'] || '').toString().replace(/\s+/g, '').toLowerCase();
        const id = (row['배출번호'] || '').toString().replace(/\s+/g, '').toLowerCase();
        const phone = (row['휴대폰'] || row['연락처'] || row['전화번호'] || '').toString().replace(/\s+/g, '').toLowerCase();
        const address = (row['주소'] || '').toString().replace(/\s+/g, '').toLowerCase();
        const item = (row['품목'] || '').toString().replace(/\s+/g, '').toLowerCase();
        return name.includes(searchTarget) || id.includes(searchTarget) || phone.includes(searchTarget) || address.includes(searchTarget) || item.includes(searchTarget);
      });
    } else {
      filtered = allParsedData.filter(row => selectedDates.includes(row._dateStr));
    }
    
    const groupedByDate = {};
    filtered.forEach(row => {
      const dateStr = row._dateStr;
      const id = row['배출번호'];
      if (!id) return;
      
      if (!groupedByDate[dateStr]) {
        groupedByDate[dateStr] = {};
      }
      
      if (!groupedByDate[dateStr][id]) {
        const formatKSTDate = (isoStr) => {
          if (!isoStr) return '';
          const d = new Date(isoStr);
          if (isNaN(d.getTime())) return String(isoStr);
          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };
        
        groupedByDate[dateStr][id] = {
          id,
          name: row['신청자'] || row['성명'] || row['신청인'] || row['이름'] || row['성명(법인명)'] || '이름 없음',
          phone: row['휴대폰'] || row['연락처'] || row['전화번호'] || '',
          address: row['주소'] || '',
          detailAddress: row['상세위치'] || '',
          applyDate: row._dateStr || formatKSTDate(row['신청일자']),
          pickupDate: formatKSTDate(row['배출일자']),
          items: []
        };
      }
      
      groupedByDate[dateStr][id].items.push({
        item: row['품목'],
        spec: row['규격'],
        qty: row['신청수량'] || 1
      });
    });

    const flatGroups = [];
    Object.keys(groupedByDate).forEach(dateStr => {
      Object.values(groupedByDate[dateStr]).forEach(group => {
        flatGroups.push({ ...group, _dateStr: dateStr });
      });
    });

    if (statusSort === 'address') {
      flatGroups.sort((a, b) => {
        const addrA = (a.address || '').trim();
        const addrB = (b.address || '').trim();
        if (addrA === addrB) {
          return (b.detailAddress || '').localeCompare(a.detailAddress || '');
        }
        return addrB.localeCompare(addrA);
      });
      return [{ date: '선택 날짜 (같은 주소별)', groups: flatGroups }];
    } else {
      const dateKeys = Object.keys(groupedByDate).sort();
      if (statusSort === 'dateDesc') {
        dateKeys.reverse();
      }
      return dateKeys.map(dateStr => {
        const sortedGroups = Object.values(groupedByDate[dateStr]).sort((a, b) => {
          if (statusSort === 'dateDesc') {
            return b.id.localeCompare(a.id);
          }
          return a.id.localeCompare(b.id);
        });
        return {
          date: dateStr,
          groups: sortedGroups
        };
      });
    }
  }, [allParsedData, selectedDates, statusSearchTerm, statusSort]);

  // 달력 관련 로직
  const handlePrevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1));
  };
  const handleNextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1));
  };
  
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay(); // 0(Sun) - 6(Sat)
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      const d = String(i).padStart(2, '0');
      const m = String(month + 1).padStart(2, '0');
      days.push(`${year}-${m}-${d}`);
    }
    return days;
  }, [currentMonth]);

  return (
    <>
      <header className="app-header">
        <h1 className="app-title">폐가구처리 매니저</h1>
        <div className="app-subtitle">
          {activeTab === 'search' && '🔍 품목검색'}
          {activeTab === 'cart' && '🧾 견적 총비용'}
          {activeTab === 'status' && '📋 접수현황 관리'}
          {activeTab === 'share' && '🤝 폐가구공유'}
        </div>
      </header>

      <main className="app-content">
        
        {/* === SEARCH TAB === */}
        {activeTab === 'search' && (
          <div className="tab-search">
            <div className="search-input-wrapper">
              <input
                type="text"
                className="search-input"
                placeholder="품목 검색 (예: 의자, 1인용)"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            
            <div className="list-container">
              {filteredItems.slice(0, 100).map((item) => (
                <div 
                  key={item.id} 
                  className="item-card clickable" 
                  onClick={() => addToCart(item)}
                >
                  <div className="item-info">
                    <h4>{item.item}</h4>
                    <p>{item.spec}</p>
                  </div>
                  <div className="item-price">
                    +{item.price.toLocaleString()}원
                  </div>
                </div>
              ))}
              {filteredItems.length === 0 && (
                <div className="empty-state">검색 결과가 없습니다.</div>
              )}
              {filteredItems.length > 100 && (
                <div className="empty-state">항목이 너무 많습니다. 검색어를 더 입력해주세요.</div>
              )}
            </div>
          </div>
        )}

        {/* === CART TAB === */}
        {activeTab === 'cart' && (
          <div className="tab-cart">
            <div className="cart-total-header">
              <div>
                <h3 style={{ margin: 0 }}>총비용</h3>
                <p style={{margin: 0, opacity: 0.8, fontSize: '0.8rem', marginTop: '4px'}}>{cartItemsCount}개 항목</p>
              </div>
              <div className="total-price">{totalCost.toLocaleString()}원</div>
            </div>

            {cart.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.8rem' }}>
                <button 
                  className="empty-cart-btn-outside" 
                  onClick={() => {
                    if (window.confirm("견적서를 모두 비우시겠습니까?")) {
                      setCart([]);
                    }
                  }}
                >
                  🗑️ 견적 비우기
                </button>
              </div>
            )}

            <div className="list-container">
              {cart.length === 0 ? (
                <div className="empty-state">
                  견적서가 비어있습니다.<br/>
                  하단 검색 탭에서 품목을 추가해주세요.
                </div>
              ) : (
                cart.map((c) => (
                  <div key={c.id} className="item-card" style={{ background: 'var(--border-color)' }}>
                    <div className="item-info">
                      <h4>{c.item}</h4>
                      <p>{c.spec}</p>
                      <div className="item-price" style={{marginTop: '4px'}}>
                        {(c.price * c.qty).toLocaleString()}원
                      </div>
                    </div>
                    <div className="cart-controls">
                      <div className="qty-control">
                        <button className="qty-btn" onClick={() => updateQty(c.id, -1)}>-</button>
                        <div className="qty-display">{c.qty}</div>
                        <button className="qty-btn" onClick={() => updateQty(c.id, 1)}>+</button>
                      </div>
                      <button className="delete-btn" onClick={() => removeFromCart(c.id)}>✕</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* === STATUS TAB (폐가구접수현황) === */}
        {activeTab === 'status' && (
          <div className="tab-status">
            <div className="upload-wrapper">
              <input 
                id="excel-upload"
                type="file" 
                accept="application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xls,.xlsx" 
                onChange={handleFileUpload}
                style={{ display: 'none' }} 
              />
              <label htmlFor="excel-upload" className="upload-btn">
                엑셀자료 서버전송
              </label>
              {fileName && (
                <>
                  <p className="file-name" style={{ marginBottom: updatedAt ? '4px' : '0', color: 'var(--primary-color)', fontWeight: 'bold' }}>
                    서버에 등록된 엑셀파일: {fileName}
                  </p>
                  {updatedAt && (
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#666' }}>
                      (서버에서 동기화됨: {new Date(updatedAt).toLocaleString()})
                    </p>
                  )}
                </>
              )}
            </div>

            {/* 접수현황 내 검색창 및 정렬 */}
            <div className="status-search-container" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div className="status-search-wrapper">
                <span className="status-search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="이름, 품목, 연락처, 배출번호, 주소 검색..."
                  value={statusSearchTerm}
                  onChange={(e) => setStatusSearchTerm(e.target.value)}
                  className="status-search-input"
                />
                {statusSearchTerm && (
                  <button className="status-search-clear" onClick={() => setStatusSearchTerm('')}>✕</button>
                )}
              </div>
              <div className="status-sort-wrapper" style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <select 
                  value={statusSort} 
                  onChange={(e) => setStatusSort(e.target.value)}
                  style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.9rem', backgroundColor: '#fff', cursor: 'pointer' }}
                >
                  <option value="dateDesc">📅 최근 날짜순</option>
                  <option value="dateAsc">📅 오래된 날짜순</option>
                  <option value="address">📍 같은 주소별</option>
                </select>
              </div>
            </div>

            {/* 검색 중일 때 헤더 (목록으로 돌아가기) */}
            {statusSearchTerm && (
              <div className="search-results-header">
                <p className="search-results-title">
                  검색 결과 (총 {statusDataByDate.reduce((acc, cur) => acc + cur.groups.length, 0)}건)
                </p>
                <button className="back-to-list-btn" onClick={() => setStatusSearchTerm('')}>
                  ← 목록으로 돌아가기
                </button>
              </div>
            )}

            {/* 날짜 선택 버튼 */}
            {availableDates.length > 0 && !statusSearchTerm && (
              <div className="date-select-wrapper">
                <button 
                  className="date-select-btn"
                  onClick={openCalendar}
                >
                  📅 날짜 선택하기 <span className="date-count">({selectedDates.length}일 선택됨)</span>
                </button>
              </div>
            )}

            <div className="list-container">
              {allParsedData.length > 0 && statusDataByDate.length === 0 ? (
                <div className="empty-state">
                  {statusSearchTerm ? (
                    <>검색 결과가 없습니다.</>
                  ) : (
                    <>
                      선택된 날짜에 배출 신청 건이 없습니다.<br/>
                      (위의 날짜 선택하기 버튼을 눌러주세요)
                    </>
                  )}
                </div>
              ) : statusDataByDate.length === 0 ? (
                <div className="empty-state">
                  오늘 날짜의 배출 신청 건이 없습니다.<br/>
                  (엑셀 파일을 업로드해 주세요)
                </div>
              ) : (
                statusDataByDate.map((dateObj) => (
                  <div key={dateObj.date} className="date-group-section">
                    <h3 className="date-group-header">📅 {dateObj.date} 접수건</h3>
                    {dateObj.groups.map((group) => {
                      const statusData = pickupStatuses[group.id] || {};
                      const isCompleted = statusData.completed;

                      return (
                      <div key={group.id} className={`status-card ${isCompleted ? 'completed' : ''}`}>
                        <div className="status-header">
                          <div 
                            className="status-badge" 
                            style={{ cursor: 'pointer' }}
                            onClick={() => handleCopyId(group.id)}
                            title="클릭하여 복사"
                          >
                            배출번호: {group.id}
                          </div>
                          <a href={`tel:${group.phone}`} className="status-contact">📞 {group.phone}</a>
                        </div>
                        <div className="status-name-address">
                          <div className="status-dates" style={{ display: 'flex', gap: '8px', marginBottom: '8px', fontSize: '0.85rem' }}>
                            {group.applyDate && <span className="status-date-badge apply-date" style={{ background: '#e3f2fd', color: '#1976d2', padding: '4px 8px', borderRadius: '4px' }}>신청일자: {group.applyDate}</span>}
                            {group.pickupDate && <span className="status-date-badge pickup-date" style={{ background: '#e8f5e9', color: '#388e3c', padding: '4px 8px', borderRadius: '4px' }}>배출일자: {group.pickupDate}</span>}
                          </div>
                          <div className="status-name">👤 {group.name}</div>
                          <div className="status-address-row">
                            <div className="status-address">
                              <div>
                                📍 {group.address} 
                                {getAptName(group.address) && (
                                  <span style={{ color: '#0066cc', fontWeight: 'bold', marginLeft: '6px' }}>
                                    ({getAptName(group.address)})
                                  </span>
                                )}
                              </div>
                              {group.detailAddress && <div className="status-detail-address" style={{ marginTop: '4px', color: '#555', fontSize: '0.9em' }}>상세위치: {group.detailAddress}</div>}
                            </div>
                            <a 
                              href={`https://map.naver.com/v5/search/${encodeURIComponent(group.address)}`} 
                              target="_blank" 
                              rel="noreferrer" 
                              className="map-link-btn"
                            >
                              🗺️ 지도
                            </a>
                          </div>
                        </div>
                        <div className="status-items">
                          {group.items.map((item, idx) => (
                            <div key={idx} className="status-item-row">
                              <span className="s-item-name">{item.item}</span>
                              <span className="s-item-spec">{item.spec}</span>
                              <span className="s-item-qty">x{item.qty}</span>
                            </div>
                          ))}
                        </div>

                        {/* 사진 업로드 영역 */}
                        <div className="photo-actions">
                          <div className="photo-upload-box">
                            {(optimisticImages[`${group.id}_before`] || statusData.beforeImage) ? (
                              <div className="uploaded-photo-wrapper" onClick={() => openFullScreen([optimisticImages[`${group.id}_before`] || statusData.beforeImage], 0)}>
                                <img src={optimisticImages[`${group.id}_before`] || statusData.beforeImage} alt="수거 전" className={`photo-thumb ${uploadingImages[`${group.id}_before`] ? 'uploading-blur' : ''}`} loading="lazy" decoding="async" />
                                <div className="photo-label">📷 수거 전</div>
                                {uploadingImages[`${group.id}_before`] && <div className="photo-upload-spinner">⏳</div>}
                                {!uploadingImages[`${group.id}_before`] && <button className="photo-delete-btn" onClick={(e) => deleteImage(e, group.id, 'before')}>✕</button>}
                              </div>
                            ) : (
                              <>
                                <input type="file" id={`before_${group.id}`} accept="image/*" capture="environment" style={{display:'none'}} onChange={(e) => handleImageUpload(e, group.id, 'before')} />
                                <label htmlFor={`before_${group.id}`} className="photo-upload-btn">📷 수거 전 등록</label>
                              </>
                            )}
                          </div>
                          
                          <div className="photo-upload-box">
                            {(optimisticImages[`${group.id}_after`] || statusData.afterImage) ? (
                              <div className="uploaded-photo-wrapper" onClick={() => openFullScreen([optimisticImages[`${group.id}_after`] || statusData.afterImage], 0)}>
                                <img src={optimisticImages[`${group.id}_after`] || statusData.afterImage} alt="수거 후" className={`photo-thumb ${uploadingImages[`${group.id}_after`] ? 'uploading-blur' : ''}`} loading="lazy" decoding="async" />
                                <div className="photo-label">📸 수거 후</div>
                                {uploadingImages[`${group.id}_after`] && <div className="photo-upload-spinner">⏳</div>}
                                {!uploadingImages[`${group.id}_after`] && <button className="photo-delete-btn" onClick={(e) => deleteImage(e, group.id, 'after')}>✕</button>}
                              </div>
                            ) : (
                              <>
                                <input type="file" id={`after_${group.id}`} accept="image/*" capture="environment" style={{display:'none'}} onChange={(e) => handleImageUpload(e, group.id, 'after')} />
                                <label htmlFor={`after_${group.id}`} className="photo-upload-btn">📸 수거 후 등록</label>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="status-actions">
                          <button 
                            className={`complete-btn ${isCompleted ? 'is-completed' : ''}`}
                            onClick={() => toggleComplete(group.id, isCompleted)}
                          >
                            {isCompleted ? '✅ 수거 완료됨 (클릭 시 취소)' : '⬜ 수거 완료 처리'}
                          </button>
                        </div>
                      </div>
                      )
                    })}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* === SHARE TAB (폐가구공유) === */}
        {activeTab === 'share' && (
          <div className="tab-share">
            {!isShareWriting ? (
              <div className="share-list-container">
                <div className="share-date-header" style={{ justifyContent: 'center', background: 'transparent', boxShadow: 'none' }}>
                  {shareAvailableDates.length > 0 && (
                    <button 
                      className="date-select-btn"
                      onClick={() => openCalendar('share')}
                    >
                      📅 날짜 선택하기 <span className="date-count">({shareSelectedDates.length}일 선택됨)</span>
                    </button>
                  )}
                </div>

                <button className="share-write-btn" onClick={openShareWrite}>
                  ✍️ 새 공유글 작성하기
                </button>
                {filteredSharedWastes.length === 0 ? (
                  <div className="empty-state">해당 날짜에 공유된 폐가구가 없습니다.</div>
                ) : (
                  filteredSharedWastes.map(waste => (
                    <div key={waste.id} className={`share-card ${waste.completed ? 'completed' : ''}`}>
                      <div className="share-card-header">
                        <span className="share-time">
                          {new Date(waste.createdAt).toLocaleString()}
                        </span>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          {waste.completed && <span className="share-completed-badge">✅ 수거완료</span>}
                          <button className="share-edit-btn" onClick={() => editSharePost(waste)} style={{ background: '#f8f9fa', border: '1px solid #ddd', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '0.8rem' }}>✏️ 수정</button>
                          <button className="share-delete-btn" onClick={() => deleteSharedPost(waste.id)}>🗑️ 삭제</button>
                        </div>
                      </div>
                      
                      {waste.memo && (
                        <div className="share-memo-display">
                          {waste.memo}
                        </div>
                      )}

                      <div className="share-photo-grid">
                        {waste.photos && waste.photos.map((url, idx) => (
                          <div key={idx} className="share-preview-item">
                            <img 
                              src={url} 
                              alt="폐가구" 
                              loading="lazy"
                              decoding="async"
                              onClick={() => openFullScreen(waste.photos, idx)}
                            />
                            <button 
                              className="share-preview-remove" 
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteSingleSharePhoto(waste.id, waste.photos, idx);
                              }}
                            >✕</button>
                          </div>
                        ))}
                      </div>
                      <button 
                        className="share-complete-btn" 
                        onClick={() => toggleShareComplete(waste.id, waste.completed)}
                      >
                        {waste.completed ? '수거 취소' : '✅ 수거 완료 처리'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="share-write-container">
                <h3 className="share-write-title">{editingShareId ? '폐가구 공유 수정' : '새 폐가구 공유'}</h3>
                
                <div className="share-write-actions">
                  <div className="upload-wrapper" style={{width: '100%', boxSizing: 'border-box', display: 'flex', gap: '0.5rem'}}>
                    <input 
                      id="share-photo-capture"
                      type="file" 
                      accept="image/*"
                      capture="environment"
                      onChange={handleSharePhotoUpload}
                      style={{ display: 'none' }} 
                    />
                    <label htmlFor="share-photo-capture" className="share-action-btn primary" style={{flex: 1}}>
                      📷 사진촬영
                    </label>

                    <input 
                      id="share-photo-upload"
                      type="file" 
                      accept="image/*"
                      multiple
                      onChange={handleSharePhotoUpload}
                      style={{ display: 'none' }} 
                    />
                    <label htmlFor="share-photo-upload" className="share-action-btn secondary" style={{flex: 1}}>
                      📁 사진불러오기
                    </label>
                  </div>
                  
                  <button className="share-action-btn secondary" onClick={handleGetLocation}>
                    📍 내 위치 지도 보기 (스샷용)
                  </button>
                </div>

                <div className="share-memo-wrapper">
                  <textarea
                    className="share-memo-input"
                    placeholder="특이사항이나 메모를 입력해주세요 (선택사항)"
                    value={shareMemo}
                    onChange={(e) => setShareMemo(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="share-preview-grid">
                  {sharePhotos.map((photoObj, idx) => (
                    <div key={idx} className="share-preview-item">
                      <img 
                        src={photoObj.url} 
                        alt="미리보기" 
                        loading="lazy"
                        decoding="async"
                        className={photoObj.isUploading ? 'uploading-blur' : ''}
                        onClick={() => openFullScreen(sharePhotos.map(p => p.url), idx)} 
                      />
                      {photoObj.isUploading && <div className="photo-upload-spinner">⏳</div>}
                      {!photoObj.isUploading && <button className="share-preview-remove" onClick={() => removeSharePhoto(idx)}>✕</button>}
                    </div>
                  ))}
                  {sharePhotos.length === 0 && (
                    <div className="empty-preview">추가된 사진이 없습니다.</div>
                  )}
                </div>

                <div className="share-write-footer">
                  <button className="share-cancel-btn" onClick={() => { setSharePhotos([]); closeShareWrite(); }}>
                    취소
                  </button>
                  <button className="share-submit-btn" onClick={submitSharePost} disabled={sharePhotos.length === 0 || sharePhotos.some(p => p.isUploading)}>
                    🚀 업로드 완료
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

      </main>

      {/* 캘린더 모달 팝업 */}
      {isCalendarOpen && (
        <div className="modal-overlay">
          <div className="calendar-modal">
            <div className="calendar-header">
              <button onClick={handlePrevMonth}>◀</button>
              <h3>{currentMonth.getFullYear()}년 {currentMonth.getMonth() + 1}월</h3>
              <button onClick={handleNextMonth}>▶</button>
            </div>
            
            <div className="calendar-weekdays">
              <div>일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div>토</div>
            </div>
            
            <div className="calendar-grid">
              {calendarDays.map((dateStr, idx) => {
                if (!dateStr) return <div key={idx} className="calendar-day empty"></div>;
                
                const dayNum = parseInt(dateStr.split('-')[2], 10);
                const activeAvailableDates = calendarMode === 'share' ? shareAvailableDates : availableDates;
                const activeSelectedDates = calendarMode === 'share' ? shareSelectedDates : selectedDates;
                const isAvailable = activeAvailableDates.includes(dateStr);
                const isSelected = activeSelectedDates.includes(dateStr);
                
                return (
                  <div 
                    key={dateStr} 
                    className={`calendar-day ${isAvailable ? 'available' : ''} ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      if (isAvailable) toggleDate(dateStr);
                    }}
                  >
                    {dayNum}
                  </div>
                );
              })}
            </div>

            <div className="modal-footer">
              <button 
                className="modal-close-btn"
                onClick={closeCalendar}
              >
                선택 완료
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 사진 크게 보기 모달 */}
      {fullScreenData.images && fullScreenData.images.length > 0 && (
        <div className="modal-overlay" onClick={closeFullScreen}>
          <div 
            className="fullscreen-image-container" 
            onClick={(e) => e.stopPropagation()}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
          >
            <img 
              src={fullScreenData.images[fullScreenData.currentIndex]} 
              alt="크게 보기" 
              loading="lazy"
              decoding="async"
              className="fullscreen-image"
              onClick={(e) => e.stopPropagation()} 
            />
            {fullScreenData.images.length > 1 && (
              <>
                <button 
                  className="nav-btn prev-btn" 
                  onClick={(e) => {
                    e.stopPropagation();
                    setFullScreenData(prev => ({
                      ...prev,
                      currentIndex: prev.currentIndex > 0 ? prev.currentIndex - 1 : prev.images.length - 1
                    }));
                  }}
                >
                  ◀
                </button>
                <button 
                  className="nav-btn next-btn" 
                  onClick={(e) => {
                    e.stopPropagation();
                    setFullScreenData(prev => ({
                      ...prev,
                      currentIndex: prev.currentIndex < prev.images.length - 1 ? prev.currentIndex + 1 : 0
                    }));
                  }}
                >
                  ▶
                </button>
                <div className="fullscreen-counter">
                  {fullScreenData.currentIndex + 1} / {fullScreenData.images.length}
                </div>
              </>
            )}
            <button className="close-fullscreen-btn" onClick={closeFullScreen}>✕ 닫기</button>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className="bottom-nav">
        <button 
          className={`nav-item ${activeTab === 'search' ? 'active' : ''}`}
          onClick={() => handleTabChange('search')}
        >
          <span className="nav-icon">🔍</span>
          <span>검색</span>
        </button>
        <button 
          className={`nav-item ${activeTab === 'cart' ? 'active' : ''}`}
          onClick={() => handleTabChange('cart')}
        >
          <span className="nav-icon">🧾</span>
          <span>견적서</span>
          {cartItemsCount > 0 && (
            <span className="badge">{cartItemsCount > 99 ? '99+' : cartItemsCount}</span>
          )}
        </button>
        <button 
          className={`nav-item ${activeTab === 'status' ? 'active' : ''}`}
          onClick={() => handleTabChange('status')}
        >
          <span className="nav-icon">📋</span>
          <span>접수현황</span>
        </button>
        <button 
          className={`nav-item ${activeTab === 'share' ? 'active' : ''}`}
          onClick={() => handleTabChange('share')}
        >
          <span className="nav-icon">🤝</span>
          <span>폐가구공유</span>
        </button>
      </nav>
    </>
  )
}

export default App
