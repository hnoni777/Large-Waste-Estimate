import { useState, useMemo, useEffect, useDeferredValue, useRef } from 'react'
import data from '../data.json'
import * as XLSX from 'xlsx'


const APT_MAPPING = {
  "오리로 801": "이편한 세상",
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
  "가림일로 55": "현대아파트",
  "도덕공원로 49": "브라운스톤 1차"
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
import { collection, doc, onSnapshot, setDoc, deleteDoc, getDocs } from 'firebase/firestore'
import './index.css'

function App() {
  const [activeTab, setActiveTab] = useState('search') // 'search', 'cart', 'status'
  const [searchTerm, setSearchTerm] = useState('')
  const [cart, setCart] = useState([])
  
  // 배출현황 관련 상태
  const [allParsedData, setAllParsedData] = useState([])
  const [availableDates, setAvailableDates] = useState([])
  const [jiguSelectedDates, setJiguSelectedDates] = useState([])
  const [yeogiSelectedDates, setYeogiSelectedDates] = useState([])
  
  const [fileName, setFileName] = useState('')
  const [updatedAt, setUpdatedAt] = useState(null)
  
  // 캘린더 공용 상태
  const [calendarMode, setCalendarMode] = useState('status') // 'status' | 'share'
  
  // 접수현황 내 검색 상태
  const [statusSearchTerm, setStatusSearchTerm] = useState('')
  const deferredStatusSearchTerm = useDeferredValue(statusSearchTerm)
  const [statusSort, setStatusSort] = useState('dateDesc') // 'excelOrder', 'dateDesc', 'dateAsc'
  const [statusFilter, setStatusFilter] = useState('all') // 'all', 'completed', 'uncompleted'
  
  // 캘린더 팝업 상태
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(new Date())

  const [activeSourceTab, setActiveSourceTab] = useState('지구하다');
  const selectedDates = activeSourceTab === '지구하다' ? jiguSelectedDates : yeogiSelectedDates;
  const setSelectedDates = activeSourceTab === '지구하다' ? setJiguSelectedDates : setYeogiSelectedDates;
  const [oldFixedData, setOldFixedData] = useState([]);

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + 'old_data.json')
      .then(res => res.json())
      .then(data => setOldFixedData(data))
      .catch(err => console.error("Failed to load old data", err));
  }, []);

  const combinedData = useMemo(() => {
    return activeSourceTab === '지구하다' ? allParsedData : oldFixedData;
  }, [allParsedData, oldFixedData, activeSourceTab]);

  const combinedAvailableDates = useMemo(() => {
    const dates = new Set();
    const sourceData = activeSourceTab === '지구하다' ? allParsedData : oldFixedData;
    sourceData.forEach(row => {
      if (row._dateStr) {
        dates.add(row._dateStr);
      }
    });
    return Array.from(dates).sort().reverse();
  }, [allParsedData, oldFixedData, activeSourceTab]);

  // 지구하다 기본 세팅 (현재날짜 포함 과거 5일치)
  useEffect(() => {
    if (jiguSelectedDates.length === 0) {
      const dates = [];
      const today = new Date();
      for (let i = 0; i < 5; i++) {
        const d = new Date(today);
        d.setDate(today.getDate() - i); // 0(오늘), -1(어제), -2(그제), -3, -4
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        dates.push(`${year}-${month}-${day}`);
      }
      setJiguSelectedDates(dates);
    }
  }, []);

  // 여기로 기본 5일 세팅
  useEffect(() => {
    const dates = new Set();
    oldFixedData.forEach(row => { if (row._dateStr) dates.add(row._dateStr); });
    const available = Array.from(dates).sort().reverse();
    if (yeogiSelectedDates.length === 0 && available.length > 0) {
      setYeogiSelectedDates(available.slice(0, 5));
    }
  }, [oldFixedData]);

  // 탭 변경 시 화면 맨 위로 스크롤
  useEffect(() => {
    const contentContainer = document.querySelector('.app-content');
    if (contentContainer) {
      contentContainer.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    }
  }, [activeTab]);

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
        
        const defaultDates = [];
        for (let i = 0; i < 5; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          defaultDates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
        }
        
        let datesArr = parsed.availableDates || [];
        defaultDates.forEach(d => {
          if (!datesArr.includes(d)) datesArr.push(d);
        });
        datesArr.sort().reverse();
        setAvailableDates(datesArr);
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
        const defaultDates = [];
        for (let i = 0; i < 5; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          defaultDates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
        }
        
        let datesArr = data.availableDates || [];
        defaultDates.forEach(d => {
          if (!datesArr.includes(d)) datesArr.push(d);
        });
        datesArr.sort().reverse();
        
        setAvailableDates(datesArr);
        setFileName(data.fileName || '');
        setUpdatedAt(data.updatedAt || null);
        
        // 새로운 데이터로 로컬 캐시 덮어쓰기
        localStorage.setItem('waste_app_data', JSON.stringify(data));
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
  const [shareTeamTab, setShareTeamTab] = useState('0258'); // '0258' | '4069'
  const [shareFormTeam, setShareFormTeam] = useState('0258');
  const [shareDate, setShareDate] = useState(() => {
    const dt = new Date();
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  });

  const shareAvailableDates = useMemo(() => {
    const dates = new Set();
    const defaultDays = shareTeamTab === 'office' ? 5 : 2;
    for (let i = 0; i < defaultDays; i++) {
      const dt = new Date();
      dt.setDate(dt.getDate() - i);
      dates.add(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`);
    }

    sharedWastes.forEach(item => {
      let dateStr = item.date;
      if (!dateStr && item.createdAt) {
        const d = new Date(item.createdAt);
        dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
      if (dateStr) dates.add(dateStr);
    });
    return Array.from(dates).sort().reverse();
  }, [sharedWastes, shareTeamTab]);

  const prevShareTeamRef = useRef(shareTeamTab);

  useEffect(() => {
    const isTabChanged = prevShareTeamRef.current !== shareTeamTab;
    prevShareTeamRef.current = shareTeamTab;
    const defaultDays = shareTeamTab === 'office' ? 5 : 2;

    setShareSelectedDates(prev => {
      const isValid = prev.length > 0 && prev.every(d => shareAvailableDates.includes(d));
      if (isTabChanged || !isValid) {
        const defaultDates = [];
        for (let i = 0; i < defaultDays; i++) {
          const dt = new Date();
          dt.setDate(dt.getDate() - i);
          defaultDates.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`);
        }
        return defaultDates;
      }
      return prev;
    });
  }, [shareAvailableDates, shareTeamTab]);

  useEffect(() => {
    const unsubscribeShare = onSnapshot(collection(db, 'shared_wastes'), (snapshot) => {
      const wastes = [];
      let hasVeryRecentPost = false;
      const recentDates = new Set();
      
      snapshot.forEach(doc => {
        const data = doc.data();
        wastes.push({ id: doc.id, ...data });
        
        // 5분 이내에 새로 올라온 글이 있다면 해당 날짜를 강제로 선택 목록에 추가 (실시간 자동 갱신을 위해)
        if (data.createdAt && Date.now() - data.createdAt < 5 * 60 * 1000) {
          hasVeryRecentPost = true;
          if (data.date) {
            recentDates.add(data.date);
          } else {
            const d = new Date(data.createdAt);
            recentDates.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
          }
        }
      });
      wastes.sort((a, b) => b.createdAt - a.createdAt);
      setSharedWastes(wastes);

      if (hasVeryRecentPost && recentDates.size > 0) {
        setShareSelectedDates(prev => {
          const newDates = Array.from(recentDates).filter(d => !prev.includes(d));
          if (newDates.length > 0) {
            return [...newDates, ...prev];
          }
          return prev;
        });
      }
    });
    return () => unsubscribeShare();
  }, []);

  const handleRefreshShare = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'shared_wastes'));
      const wastes = [];
      snapshot.forEach(doc => {
        wastes.push({ id: doc.id, ...doc.data() });
      });
      wastes.sort((a, b) => b.createdAt - a.createdAt);
      setSharedWastes(wastes);

      // 강제 새로고침 시 날짜 선택을 현재 날짜 기준으로 업데이트 (앱 켜둔 상태 유지 시 누락 방지)
      const defaultDates = [];
      for (let i = 0; i < 2; i++) {
        const dt = new Date();
        dt.setDate(dt.getDate() - i);
        defaultDates.push(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`);
      }
      
      setShareSelectedDates(prev => {
        const missing = defaultDates.filter(d => !prev.includes(d));
        if (missing.length > 0) {
          return Array.from(new Set([...defaultDates, ...prev]));
        }
        return prev;
      });

      alert('목록이 최신 상태로 갱신되었습니다.');
    } catch (error) {
      console.error('Error refreshing shared wastes:', error);
      alert('갱신 중 오류가 발생했습니다.');
    }
  };

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
    setShareFormTeam(shareTeamTab);
    
    // 글 작성 시 날짜를 무조건 현재 실제 날짜로 갱신
    const dt = new Date();
    setShareDate(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`);
    
    window.history.pushState({ type: 'modal', modal: 'shareWrite' }, '');
    setIsShareWriting(true);
  };

  const editSharePost = (waste) => {
    setEditingShareId(waste.id);
    setSharePhotos(waste.photos ? waste.photos.map((url, i) => ({ id: `old_${i}`, url, isUploading: false })) : []);
    setShareMemo(waste.memo || '');
    setShareFormTeam(waste.team || '0258');
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

  const exportToExcel = (data) => {
    if (!combinedData || combinedData.length === 0) {
      alert("출력할 데이터가 없습니다.");
      return;
    }
    
    // 엑셀 출력용 데이터 변환
    const excelData = data.map((d, index) => ({
      ...d
    }));
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
    if (sharePhotos.length === 0 && shareMemo.trim() === '') {
      alert("내용이나 사진을 입력해주세요.");
      return;
    }
    if (sharePhotos.some(p => p.isUploading)) {
      alert("사진 업로드가 진행 중입니다. 잠시만 기다려주세요.");
      return;
    }

    const finalUrls = sharePhotos.map(p => p.url);
    
    let finalMemo = shareMemo.trim();
    if (shareFormTeam === 'office') {
      finalMemo = injectAptNameIfMissing(finalMemo);
    }

    try {
      if (editingShareId) {
        await setDoc(doc(db, 'shared_wastes', editingShareId), {
          photos: finalUrls,
          memo: finalMemo,
          team: shareFormTeam
        }, { merge: true });
      } else {
        const newDocRef = doc(collection(db, 'shared_wastes'));
        await setDoc(newDocRef, {
          photos: finalUrls,
          createdAt: Date.now(),
          date: shareDate,
          memo: finalMemo,
          completed: false,
          team: shareFormTeam
        });
      }
      setSharePhotos([]);
      setShareMemo('');
      setEditingShareId(null);
      
      // 방금 올린 글이 목록에 보이도록, 해당 날짜가 필터에 없으면 강제 추가
      setShareSelectedDates(prev => {
        if (!prev.includes(shareDate)) {
          return [shareDate, ...prev];
        }
        return prev;
      });

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
    const teamFiltered = sharedWastes.filter(waste => (waste.team || '0258') === shareTeamTab);
    return teamFiltered.filter(waste => {
      let dateStr = waste.date;
      if (!dateStr && waste.createdAt) {
        const d = new Date(waste.createdAt);
        dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
      return shareSelectedDates.includes(dateStr);
    });
  }, [sharedWastes, shareSelectedDates, shareTeamTab]);

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
      
      const enrichedData = [];

      parsedData.forEach(row => {
        let d = row['신청일자'] || row['신청일'] || row['신철일'] || row['배출일자'] || row['배출일'];
        
        if (typeof d === 'string' || typeof d === 'number') {
          const parsed = new Date(d);
          if (!isNaN(parsed.getTime())) {
             d = parsed;
          }
        }

        if (d instanceof Date && !isNaN(d)) {
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          const dateStr = `${yyyy}-${mm}-${dd}`;
          
          const minimalRow = {};
          const keepFields = [
            '신청자', '성명', '신청인', '이름', '성명(법인명)',
            '휴대폰', '연락처', '전화번호',
            '주소', '도로명주소', '도로명',
            '상세위치', '상세주소',
            '신청일자', '신청일', '신철일',
            '배출일자', '배출일',
            '배출동', '배출메모', '베출메모',
            '품목명', '품목', '규격',
            '신청수량', '수량',
            '합계', '단가', '결제금액',
            '배출번호', '예약번호', '주문번호'
          ];
          keepFields.forEach(field => {
            if (row[field] !== undefined) {
              minimalRow[field] = row[field];
            }
          });
          
          enrichedData.push({ ...minimalRow, _dateStr: dateStr, source: activeSourceTab });
        }
      });

      // 기존 데이터 중에서 현재 탭(activeSourceTab)이 아닌 다른 탭의 데이터는 유지
      const otherSourceData = allParsedData.filter(d => d.source !== activeSourceTab);
      const newAllParsedData = [...otherSourceData, ...enrichedData];

      const rawDataToSave = {
        allParsedData: newAllParsedData,
        fileName: file.name,
        updatedAt: Date.now()
      };

      const dataToSave = JSON.parse(JSON.stringify(rawDataToSave));

      setDoc(doc(db, 'pickups', 'master_excel_data'), dataToSave)
        .then(() => {
          alert(`✅ 새로운 엑셀 명단이 서버에 전송되었습니다!`);
          e.target.value = '';
        })
        .catch(err => {
          console.error('엑셀 업데이트 실패:', err);
          alert('❌ 서버 업로드에 실패했습니다. (사유: ' + err.message + ')');
          e.target.value = '';
        });
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

  const statusDataByDate = useMemo(() => {
    let filtered = combinedData;

    if (deferredStatusSearchTerm) {
      const searchTarget = deferredStatusSearchTerm.replace(/\s+/g, '').toLowerCase();
      filtered = combinedData.filter(row => {
        if (row.source !== activeSourceTab) return false;
        const name = (row['신청자'] || row['성명'] || row['신청인'] || row['이름'] || row['성명(법인명)'] || '').toString().replace(/\s+/g, '').toLowerCase();
        const id = (row['배출번호'] || '').toString().replace(/\s+/g, '').toLowerCase();
        const phone = (row['휴대폰'] || row['연락처'] || row['전화번호'] || '').toString().replace(/\s+/g, '').toLowerCase();
        const address = (row['주소'] || row['도로명주소'] || row['도로명'] || '').toString().replace(/\s+/g, '').toLowerCase();
        const item = (row['품목명'] || row['품목'] || '').toString().replace(/\s+/g, '').toLowerCase();
        const aptName = (getAptName(row['주소'] || row['도로명주소'] || row['도로명']) || '').toString().replace(/\s+/g, '').toLowerCase();
        return name.includes(searchTarget) || id.includes(searchTarget) || phone.includes(searchTarget) || address.includes(searchTarget) || item.includes(searchTarget) || aptName.includes(searchTarget);
      });
    } else {
      filtered = combinedData.filter(row => row.source === activeSourceTab && selectedDates.includes(row._dateStr));
    }
    
    if (statusFilter === 'completed') {
      filtered = filtered.filter(row => pickupStatuses[row['배출번호']]?.completed === true);
    } else if (statusFilter === 'uncompleted') {
      filtered = filtered.filter(row => !pickupStatuses[row['배출번호']]?.completed);
    }
    
    const groupedByDate = {};
    filtered.forEach((row, index) => {
      const dateStr = row._dateStr;
      // 배출번호가 없을 경우 대비책 (기존에는 배출번호 없으면 무시)
      const id = row['배출번호'] || row['예약번호'] || row['주문번호'] || ('미상_' + Math.random().toString(36).substr(2, 6));
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
          rowIndex: index,
          name: row['신청자'] || row['성명'] || row['신청인'] || row['이름'] || row['성명(법인명)'] || '이름 없음',
          phone: row['휴대폰'] || row['연락처'] || row['전화번호'] || '',
          address: row['주소'] || row['도로명주소'] || row['도로명'] || '',
          detailAddress: row['상세위치'] || row['상세주소'] || '',
          applyDate: row._dateStr || formatKSTDate(row['신청일자'] || row['신청일'] || row['신철일']),
          pickupDate: formatKSTDate(row['배출일자'] || row['배출일']),
          source: row.source || '여기로',
          dong: row['배출동'] || '',
          memo: row['배출메모'] || row['베출메모'] || '',
          items: []
        };
      }
      
      groupedByDate[dateStr][id].items.push({
        item: row['품목명'] || row['품목'],
        spec: row['규격'],
        qty: row['신청수량'] || row['수량'] || 1,
        price: row['합계'] || row['단가'] || row['결제금액'] || 0
      });
    });

    const dateKeys = Object.keys(groupedByDate);
    if (statusSort === 'dateDesc') {
      dateKeys.sort().reverse();
    } else if (statusSort === 'dateAsc') {
      dateKeys.sort();
    } else if (statusSort === 'excelOrder') {
      dateKeys.sort((a, b) => {
        const minA = Math.min(...Object.values(groupedByDate[a]).map(g => g.rowIndex));
        const minB = Math.min(...Object.values(groupedByDate[b]).map(g => g.rowIndex));
        return minA - minB;
      });
    }

    return dateKeys.map(dateStr => {
      const sortedGroups = Object.values(groupedByDate[dateStr]).sort((a, b) => {
        // 항상 엑셀 파일 위에서 아래로(행 번호 오름차순) 정렬 유지
        return a.rowIndex - b.rowIndex;
      });
      return {
        date: dateStr,
        groups: sortedGroups
      };
    });
  }, [combinedData, selectedDates, deferredStatusSearchTerm, statusSort, statusFilter, pickupStatuses]);

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

  const renderMemoWithPhoneLinks = (memoText, team) => {
    if (!memoText) return null;
    
    let processedText = memoText;
    let aptName = null;
    if (team === 'office') {
      processedText = injectAptNameIfMissing(processedText);
      aptName = getAptName(processedText);
    }

    const phoneRegex = /(01[016789]-?\d{3,4}-?\d{4}|\d{2,3}-?\d{3,4}-?\d{4})/g;
    const parts = processedText.split(phoneRegex);
    
    return parts.map((part, index) => {
      if (phoneRegex.test(part)) {
        return (
          <a key={index} href={`tel:${part.replace(/-/g, '')}`} style={{ color: '#0066cc', fontWeight: 'bold', textDecoration: 'underline' }}>
            {part}
          </a>
        );
      }
      
      if (aptName && part.includes(aptName)) {
        const aptParts = part.split(aptName);
        return (
          <span key={index}>
            {aptParts.map((subPart, subIdx) => (
              <span key={subIdx}>
                {subPart}
                {subIdx < aptParts.length - 1 && (
                  <span style={{ color: '#0066cc', fontWeight: 'bold' }}>{aptName}</span>
                )}
              </span>
            ))}
          </span>
        );
      }

      return <span key={index}>{part}</span>;
    });
  };

  const injectAptNameIfMissing = (text) => {
    if (!text) return text;
    const aptName = getAptName(text);
    if (!aptName || text.includes(aptName.split(' ')[0])) return text;

    let addressStr = text.replace(/(01[016789]-?\d{3,4}-?\d{4}|\d{2,3}-?\d{3,4}-?\d{4})/g, ' ');
    const match = addressStr.match(/([가-힣A-Za-z0-9]+(시|도|구|군|동|읍|면|리|로|길)\s+[\w가-힣\-\s]+)/);
    if (match) {
        let candidate = match[0];
        const breakWords = ['장롱', '책상', '의자', '침대', '소파', '쇼파', '냉장고', '세탁기', '에어컨', '서랍장', '수거', '폐가구', '문앞', '특이사항', '품목', '매트리스', '거울', '장식장', '식탁', '수납장', '폐기물', '테이블', '협탁', '모니터', '티비', 'TV'];
        let minIndex = candidate.length;
        for (const bw of breakWords) {
            const idx = candidate.indexOf(bw);
            if (idx !== -1 && idx < minIndex) {
                minIndex = idx;
            }
        }
        const exactAddr = candidate.substring(0, minIndex).trim();
        return text.replace(exactAddr, exactAddr + ' ' + aptName);
    }
    return `[${aptName}] ${text}`;
  };

  const extractAddressForMap = (text) => {
    if (!text) return '';
    let addressStr = text.replace(/(01[016789]-?\d{3,4}-?\d{4}|\d{2,3}-?\d{3,4}-?\d{4})/g, ' ');
    const match = addressStr.match(/([가-힣A-Za-z0-9]+(시|도|구|군|동|읍|면|리|로|길)\s+[\w가-힣\-\s]+)/);
    if (match) {
        let candidate = match[0];
        const breakWords = ['장롱', '책상', '의자', '침대', '소파', '쇼파', '냉장고', '세탁기', '에어컨', '서랍장', '수거', '폐가구', '문앞', '특이사항', '품목', '매트리스', '거울', '장식장', '식탁', '수납장', '폐기물', '테이블', '협탁', '모니터', '티비', 'TV'];
        let minIndex = candidate.length;
        for (const bw of breakWords) {
            const idx = candidate.indexOf(bw);
            if (idx !== -1 && idx < minIndex) {
                minIndex = idx;
            }
        }
        let result = candidate.substring(0, minIndex).trim();
        const aptName = getAptName(result);
        if (aptName && !result.includes(aptName.split(' ')[0])) {
            result = result + ' ' + aptName;
        }
        return result;
    }
    
    let result = addressStr.trim();
    const aptName = getAptName(result);
    if (aptName && !result.includes(aptName.split(' ')[0])) {
        result = result + ' ' + aptName;
    }
    return result;
  };

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
            <div className="source-tabs" style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
              <button 
                className={`source-tab-btn ${activeSourceTab === '지구하다' ? 'active' : ''}`}
                onClick={() => setActiveSourceTab('지구하다')}
                style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #ccc', backgroundColor: activeSourceTab === '지구하다' ? '#3b82f6' : '#fff', color: activeSourceTab === '지구하다' ? '#fff' : '#333', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer', transition: 'all 0.2s' }}
              >
                🌍 지구하다 (신규)
              </button>
              <button 
                className={`source-tab-btn ${activeSourceTab === '여기로' ? 'active' : ''}`}
                onClick={() => setActiveSourceTab('여기로')}
                style={{ flex: 1, padding: '12px', borderRadius: '8px', border: '1px solid #ccc', backgroundColor: activeSourceTab === '여기로' ? '#3b82f6' : '#fff', color: activeSourceTab === '여기로' ? '#fff' : '#333', fontWeight: 'bold', fontSize: '1rem', cursor: 'pointer', transition: 'all 0.2s' }}
              >
                📍 여기로 (기존)
              </button>
            </div>

            {activeSourceTab === '지구하다' && (
              <div className="upload-wrapper" style={{ padding: '0.5rem 1rem', display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: '10px', borderRadius: '8px', border: '1px dashed #3b82f6', marginBottom: '15px' }}>
              <input 
                id="excel-upload"
                type="file" 
                accept="application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,.xls,.xlsx" 
                onChange={handleFileUpload}
                style={{ display: 'none' }} 
              />
              <label htmlFor="excel-upload" className="upload-btn" style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem', margin: 0, whiteSpace: 'nowrap', borderRadius: '6px' }}>
                엑셀자료 서버전송
              </label>
              <div style={{ textAlign: 'right', flex: 1, overflow: 'hidden' }}>
                {fileName && (
                  <>
                    <p className="file-name" style={{ margin: 0, color: 'var(--primary-color)', fontWeight: 'bold', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {fileName}
                    </p>
                    {updatedAt && (
                      <p style={{ margin: 0, fontSize: '0.7rem', color: '#666' }}>
                        {new Date(updatedAt).toLocaleString()}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
            )}

            {/* 접수현황 내 검색창 및 정렬 */}
            <div className="status-search-container" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div className="status-search-wrapper">
                <span className="status-search-icon">🔍</span>
                <input
                  type="text"
                  placeholder="이름, 아파트명, 배출번호, 연락처, 주소 검색..."
                  value={statusSearchTerm}
                  onChange={(e) => setStatusSearchTerm(e.target.value)}
                  className="status-search-input"
                />
                {statusSearchTerm && (
                  <button className="status-search-clear" onClick={() => setStatusSearchTerm('')}>✕</button>
                )}
              </div>
              <div className="status-sort-wrapper" style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: '4px' }}>
                <select 
                  value={statusSort} 
                  onChange={(e) => setStatusSort(e.target.value)}
                  style={{ padding: '6px 12px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '0.9rem', backgroundColor: '#fff', cursor: 'pointer' }}
                >
                  <option value="excelOrder">📝 엑셀 원본 순서</option>
                  <option value="dateDesc">📅 최근 날짜순</option>
                  <option value="dateAsc">📅 오래된 날짜순</option>
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
            {combinedAvailableDates.length > 0 && !statusSearchTerm && (
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
                    
                    <div style={{ display: 'flex', gap: '15px', padding: '10px 16px', background: '#fff', borderBottom: '1px solid #eee' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: statusFilter === 'completed' ? 'bold' : 'normal', color: statusFilter === 'completed' ? '#0066cc' : '#333' }}>
                        <input 
                          type="checkbox" 
                          checked={statusFilter === 'completed'} 
                          onChange={(e) => setStatusFilter(e.target.checked ? 'completed' : 'all')} 
                        />
                        수거완료만 보기
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: statusFilter === 'uncompleted' ? 'bold' : 'normal', color: statusFilter === 'uncompleted' ? '#0066cc' : '#333' }}>
                        <input 
                          type="checkbox" 
                          checked={statusFilter === 'uncompleted'} 
                          onChange={(e) => setStatusFilter(e.target.checked ? 'uncompleted' : 'all')} 
                        />
                        미수거만 보기
                      </label>
                    </div>

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
                          <div className="status-dates" style={{ display: 'flex', gap: '8px', marginBottom: '8px', fontSize: '0.85rem', alignItems: 'center' }}>
                            <span className={`status-source-badge ${group.source === '지구하다' ? 'source-earth' : 'source-here'}`}>
                              {group.source === '지구하다' ? '지구하다' : '여기로'}
                            </span>
                            {group.applyDate && <span className="status-date-badge apply-date" style={{ background: '#e3f2fd', color: '#1976d2', padding: '4px 8px', borderRadius: '4px' }}>신청일: {group.applyDate}</span>}
                            {group.pickupDate && <span className="status-date-badge pickup-date" style={{ background: '#e8f5e9', color: '#388e3c', padding: '4px 8px', borderRadius: '4px' }}>배출일: {group.pickupDate}</span>}
                          </div>
                          <div className="status-name">👤 {group.name}</div>
                          <div className="status-address-row">
                            <div className="status-address">
                              <div>
                                📍 {group.address} {group.detailAddress ? `${group.detailAddress} ` : ''}{group.dong && !group.address.includes(group.dong) ? `(${group.dong})` : ''}
                                {getAptName(group.address) && (
                                  <span style={{ color: '#0066cc', fontWeight: 'bold', marginLeft: '6px' }}>
                                    ({getAptName(group.address)})
                                  </span>
                                )}
                              </div>
                              {group.memo && <div className="status-memo" style={{ marginTop: '4px', color: '#d32f2f', fontSize: '0.9em', fontWeight: 'bold' }}>메모: {group.memo}</div>}
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
                <div className="team-tabs" style={{ display: 'flex', borderBottom: '1px solid #ddd', marginBottom: '15px' }}>
                  <button 
                    style={{ flex: 1, padding: '12px', background: shareTeamTab === '0258' ? '#0066cc' : '#f8f9fa', color: shareTeamTab === '0258' ? '#fff' : '#555', border: 'none', fontWeight: shareTeamTab === '0258' ? 'bold' : 'normal', cursor: 'pointer', transition: 'all 0.2s' }}
                    onClick={() => setShareTeamTab('0258')}
                  >
                    0258팀
                  </button>
                  <button 
                    style={{ flex: 1, padding: '12px', background: shareTeamTab === '4069' ? '#0066cc' : '#f8f9fa', color: shareTeamTab === '4069' ? '#fff' : '#555', border: 'none', fontWeight: shareTeamTab === '4069' ? 'bold' : 'normal', cursor: 'pointer', transition: 'all 0.2s' }}
                    onClick={() => setShareTeamTab('4069')}
                  >
                    4069팀
                  </button>
                  <button 
                    style={{ flex: 1, padding: '12px', background: shareTeamTab === 'office' ? '#0066cc' : '#f8f9fa', color: shareTeamTab === 'office' ? '#fff' : '#555', border: 'none', fontWeight: shareTeamTab === 'office' ? 'bold' : 'normal', cursor: 'pointer', transition: 'all 0.2s' }}
                    onClick={() => setShareTeamTab('office')}
                  >
                    사무실민원
                  </button>
                </div>
                <div className="share-date-header" style={{ justifyContent: 'center', background: 'transparent', boxShadow: 'none', paddingTop: 0 }}>
                  {shareAvailableDates.length > 0 && (
                    <button 
                      className="date-select-btn"
                      onClick={() => openCalendar('share')}
                    >
                      📅 날짜 선택하기 <span className="date-count">({shareSelectedDates.length}일 선택됨)</span>
                    </button>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                  <button className="share-write-btn" onClick={openShareWrite} style={{ flex: 1 }}>
                    ✍️ 새 공유글 작성하기
                  </button>
                  <button 
                    onClick={handleRefreshShare} 
                    style={{ padding: '0 15px', background: '#fff', border: '1px solid #ddd', borderRadius: '8px', cursor: 'pointer', fontSize: '1.2rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title="새로고침"
                  >
                    🔄
                  </button>
                </div>
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
                        <div className="share-memo-display" style={{ position: 'relative', whiteSpace: 'pre-wrap' }}>
                          {renderMemoWithPhoneLinks(waste.memo, waste.team)}
                          {waste.team === 'office' && (
                            <button 
                              onClick={() => window.open(`https://map.naver.com/v5/search/${encodeURIComponent(extractAddressForMap(waste.memo))}`, "_blank")}
                              style={{ display: 'block', marginTop: '10px', padding: '6px 12px', background: '#0066cc', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.9rem' }}
                            >
                              🗺️ 지도 보기
                            </button>
                          )}
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
                
                <div className="share-team-select" style={{ marginBottom: '15px', padding: '10px', background: '#f8f9fa', borderRadius: '8px' }}>
                  <p style={{ margin: '0 0 10px 0', fontSize: '0.9rem', fontWeight: 'bold' }}>담당 수거팀 선택</p>
                  <div style={{ display: 'flex', gap: '20px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                      <input 
                        type="radio" 
                        name="shareTeam" 
                        value="0258" 
                        checked={shareFormTeam === '0258'} 
                        onChange={(e) => setShareFormTeam(e.target.value)} 
                      />
                      0258팀
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                      <input 
                        type="radio" 
                        name="shareTeam" 
                        value="4069" 
                        checked={shareFormTeam === '4069'} 
                        onChange={(e) => setShareFormTeam(e.target.value)} 
                      />
                      4069팀
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer' }}>
                      <input 
                        type="radio" 
                        name="shareTeam" 
                        value="office" 
                        checked={shareFormTeam === 'office'} 
                        onChange={(e) => setShareFormTeam(e.target.value)} 
                      />
                      사무실민원
                    </label>
                  </div>
                </div>

                {shareFormTeam !== 'office' && (
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
                )}

                <div className="share-memo-wrapper">
                  <textarea
                    className="share-memo-input"
                    placeholder={shareFormTeam === 'office' ? "민원 주소 및 내용을 입력해주세요" : "특이사항이나 메모를 입력해주세요 (선택사항)"}
                    value={shareMemo}
                    onChange={(e) => setShareMemo(e.target.value)}
                    rows={3}
                  />
                </div>

                {shareFormTeam !== 'office' && (
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
                  {sharePhotos.length === 0 && shareFormTeam !== 'office' && (
                    <div className="empty-preview">추가된 사진이 없습니다.</div>
                  )}
                </div>
                )}

                <div className="share-write-footer">
                  <button className="share-cancel-btn" onClick={() => { setSharePhotos([]); closeShareWrite(); }}>
                    취소
                  </button>
                  <button className="share-submit-btn" onClick={submitSharePost} disabled={(sharePhotos.length === 0 && shareMemo.trim() === '') || sharePhotos.some(p => p.isUploading)}>
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
                const activeAvailableDates = calendarMode === 'share' ? shareAvailableDates : combinedAvailableDates;
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
