import { useState, useMemo, useEffect } from 'react'
import data from '../data.json'
import * as XLSX from 'xlsx'
import { db } from './firebase'
import { collection, doc, onSnapshot, setDoc } from 'firebase/firestore'
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
  
  // 캘린더 팝업 상태
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(new Date())

  // 앱 실행 시 저장된 엑셀 데이터 불러오기
  useEffect(() => {
    const savedData = localStorage.getItem('waste_app_data');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setAllParsedData(parsed.allParsedData || []);
        setAvailableDates(parsed.availableDates || []);
        setFileName(parsed.fileName || '');
        
        const datesArr = parsed.availableDates || [];
        const dt = new Date();
        const todayStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
        
        if (datesArr.includes(todayStr)) {
          setSelectedDates([todayStr]);
          setCurrentMonth(new Date(dt.getFullYear(), dt.getMonth(), 1));
        } else if (datesArr.length > 0) {
          setSelectedDates([datesArr[0]]);
          const [y, m] = datesArr[0].split('-');
          setCurrentMonth(new Date(Number(y), Number(m) - 1, 1));
        }
      } catch (e) {
        console.error("Failed to parse saved excel data", e);
      }
    }
  }, []);

  // 파이어베이스 실시간 수거 상태 및 사진
  const [pickupStatuses, setPickupStatuses] = useState({})
  const [uploadingImages, setUploadingImages] = useState({}) // { [id_type]: boolean }
  const [fullScreenData, setFullScreenData] = useState({ images: [], currentIndex: 0 })
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
  const [sharePhotos, setSharePhotos] = useState([]); // array of imgbb URLs
  const [isUploadingShare, setIsUploadingShare] = useState(false);
  const [shareDate, setShareDate] = useState(() => {
    const dt = new Date();
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  });

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

  const toggleComplete = async (id, currentStatus) => {
    try {
      await setDoc(doc(db, 'pickups', id), {
        completed: !currentStatus
      }, { merge: true });
    } catch (e) {
      console.error('Error updating status: ', e);
    }
  };

  // 💡 사진 업로드 속도를 비약적으로 높여주는 압축 함수
  const compressImage = (file, maxWidth = 800) => {
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

          // 화질을 60%(0.6)로 낮춰서 용량 다이어트
          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error("Canvas is empty"));
              return;
            }
            const compressedFile = new File([blob], file.name, {
              type: 'image/jpeg',
              lastModified: Date.now(),
            });
            resolve(compressedFile);
          }, 'image/jpeg', 0.6); 
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
    setUploadingImages(prev => ({ ...prev, [uploadKey]: true }));

    try {
      // 원본 대신 압축된 파일 사용
      const compressedFile = await compressImage(file, 800);

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
    
    setIsUploadingShare(true);
    const newPhotos = [];
    
    for (const file of files) {
      try {
        const compressedFile = await compressImage(file, 800);
        const formData = new FormData();
        formData.append('image', compressedFile);
        
        const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
          method: 'POST',
          body: formData
        });
        const data = await res.json();
        if (data.success) {
          newPhotos.push(data.data.url);
        }
      } catch (err) {
        console.error("Share photo upload error", err);
      }
    }
    
    setSharePhotos(prev => [...prev, ...newPhotos]);
    setIsUploadingShare(false);
    e.target.value = ''; // Reset input
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
      window.open(`https://m.map.naver.com/map.naver?lat=${lat}&lng=${lng}&dlevel=14`, "_blank");
    }, (error) => {
      alert("위치 정보를 가져오는데 실패했습니다. 폰의 GPS(위치) 설정이 켜져있는지 확인해주세요.");
    });
  };

  const submitSharePost = async () => {
    if (sharePhotos.length === 0) {
      alert("사진을 1장 이상 추가해주세요.");
      return;
    }
    try {
      const newDocRef = doc(collection(db, 'shared_wastes'));
      await setDoc(newDocRef, {
        photos: sharePhotos,
        createdAt: Date.now(),
        completed: false
      });
      setSharePhotos([]);
      setIsShareWriting(false);
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

  const filteredSharedWastes = useMemo(() => {
    return sharedWastes.filter(waste => {
      const d = new Date(waste.createdAt);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return dateStr === shareDate;
    });
  }, [sharedWastes, shareDate]);

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

      parsedData.forEach(row => {
        const d = row['신청일자'];
        if (d instanceof Date) {
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          const dateStr = `${yyyy}-${mm}-${dd}`;
          
          datesSet.add(dateStr);
          enrichedData.push({ ...row, _dateStr: dateStr });
        }
      });

      const datesArr = Array.from(datesSet).sort().reverse(); // 최근 날짜가 먼저 오게 정렬
      
      setAllParsedData(enrichedData);
      setAvailableDates(datesArr);
      
      // 로컬 스토리지에 데이터 저장 (앱을 껐다 켜도 유지되도록)
      localStorage.setItem('waste_app_data', JSON.stringify({
        allParsedData: enrichedData,
        availableDates: datesArr,
        fileName: file.name
      }));
      
      // 초기 선택 날짜: 오늘 날짜가 있으면 선택, 없으면 가장 최근 날짜 1개 선택
      const dt = new Date();
      const todayStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      if (datesArr.includes(todayStr)) {
        setSelectedDates([todayStr]);
        setCurrentMonth(new Date(dt.getFullYear(), dt.getMonth(), 1));
      } else if (datesArr.length > 0) {
        setSelectedDates([datesArr[0]]);
        const [y, m, dDay] = datesArr[0].split('-');
        setCurrentMonth(new Date(Number(y), Number(m) - 1, 1));
      } else {
        setSelectedDates([]);
      }
    };
    reader.readAsBinaryString(file);
  };

  const toggleDate = (dateStr) => {
    setSelectedDates(prev => {
      if (prev.includes(dateStr)) {
        return prev.filter(d => d !== dateStr);
      } else {
        return [...prev, dateStr].sort().reverse();
      }
    });
  };

  // 선택된 날짜별로 그룹핑하고, 그 안에서 다시 배출번호로 그룹핑
  const statusDataByDate = useMemo(() => {
    const filtered = allParsedData.filter(row => selectedDates.includes(row._dateStr));
    
    const groupedByDate = {};
    filtered.forEach(row => {
      const dateStr = row._dateStr;
      const id = row['배출번호'];
      if (!id) return;
      
      if (!groupedByDate[dateStr]) {
        groupedByDate[dateStr] = {};
      }
      
      if (!groupedByDate[dateStr][id]) {
        groupedByDate[dateStr][id] = {
          id,
          name: row['신청자'] || row['성명'] || row['신청인'] || row['이름'] || row['성명(법인명)'] || '이름 없음',
          phone: row['휴대폰'] || row['연락처'] || row['전화번호'] || '',
          address: row['주소'] || '',
          items: []
        };
      }
      
      groupedByDate[dateStr][id].items.push({
        item: row['품목'],
        spec: row['규격'],
        qty: row['신청수량'] || 1
      });
    });

    // 날짜 내림차순 정렬
    const result = Object.keys(groupedByDate).sort().reverse().map(dateStr => {
      return {
        date: dateStr,
        groups: Object.values(groupedByDate[dateStr])
      };
    });
    
    return result;
  }, [allParsedData, selectedDates]);

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
                <h3>총비용</h3>
                <p style={{margin: 0, opacity: 0.8, fontSize: '0.8rem'}}>{cartItemsCount}개 항목</p>
              </div>
              <div className="total-price">{totalCost.toLocaleString()}원</div>
            </div>

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
                엑셀 파일 불러오기
              </label>
              {fileName && <p className="file-name">선택된 파일: {fileName}</p>}
            </div>

            {/* 날짜 선택 버튼 */}
            {availableDates.length > 0 && (
              <div className="date-select-wrapper">
                <button 
                  className="date-select-btn"
                  onClick={() => setIsCalendarOpen(true)}
                >
                  📅 날짜 선택하기 <span className="date-count">({selectedDates.length}일 선택됨)</span>
                </button>
              </div>
            )}

            <div className="list-container">
              {allParsedData.length > 0 && statusDataByDate.length === 0 ? (
                <div className="empty-state">
                  선택된 날짜에 배출 신청 건이 없습니다.<br/>
                  (위의 날짜 선택하기 버튼을 눌러주세요)
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
                          <div className="status-badge">배출번호: {group.id}</div>
                          <a href={`tel:${group.phone}`} className="status-contact">📞 {group.phone}</a>
                        </div>
                        <div className="status-name-address">
                          <div className="status-name">👤 {group.name}</div>
                          <div className="status-address-row">
                            <div className="status-address">📍 {group.address}</div>
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
                            {uploadingImages[`${group.id}_before`] ? (
                              <div className="photo-loading">⏳ <span>업로드 중...</span></div>
                            ) : statusData.beforeImage ? (
                              <div className="uploaded-photo-wrapper" onClick={() => setFullScreenData({ images: [statusData.beforeImage], currentIndex: 0 })}>
                                <img src={statusData.beforeImage} alt="수거 전" className="photo-thumb" />
                                <div className="photo-label">📷 수거 전</div>
                                <button className="photo-delete-btn" onClick={(e) => deleteImage(e, group.id, 'before')}>✕</button>
                              </div>
                            ) : (
                              <>
                                <input type="file" id={`before_${group.id}`} accept="image/*" capture="environment" style={{display:'none'}} onChange={(e) => handleImageUpload(e, group.id, 'before')} />
                                <label htmlFor={`before_${group.id}`} className="photo-upload-btn">📷 수거 전 등록</label>
                              </>
                            )}
                          </div>
                          
                          <div className="photo-upload-box">
                            {uploadingImages[`${group.id}_after`] ? (
                              <div className="photo-loading">⏳ <span>업로드 중...</span></div>
                            ) : statusData.afterImage ? (
                              <div className="uploaded-photo-wrapper" onClick={() => setFullScreenData({ images: [statusData.afterImage], currentIndex: 0 })}>
                                <img src={statusData.afterImage} alt="수거 후" className="photo-thumb" />
                                <div className="photo-label">📸 수거 후</div>
                                <button className="photo-delete-btn" onClick={(e) => deleteImage(e, group.id, 'after')}>✕</button>
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
                <div className="share-date-header">
                  <input 
                    type="date" 
                    value={shareDate} 
                    onChange={(e) => setShareDate(e.target.value)}
                    className="share-date-input"
                  />
                  <span style={{ fontWeight: 'bold' }}>공유 내역</span>
                </div>

                <button className="share-write-btn" onClick={() => setIsShareWriting(true)}>
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
                        {waste.completed && <span className="share-completed-badge">✅ 수거완료</span>}
                      </div>
                      <div className="share-photo-grid">
                        {waste.photos && waste.photos.map((url, idx) => (
                          <img 
                            key={idx} 
                            src={url} 
                            alt="폐가구" 
                            className="share-photo-thumb"
                            onClick={() => setFullScreenData({ images: waste.photos, currentIndex: idx })}
                          />
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
                <h3 className="share-write-title">새 폐가구 공유</h3>
                
                <div className="share-write-actions">
                  <div className="upload-wrapper" style={{width: '100%', display: 'flex', gap: '0.5rem'}}>
                    <input 
                      id="share-photo-capture"
                      type="file" 
                      accept="image/*"
                      capture="environment"
                      onChange={handleSharePhotoUpload}
                      style={{ display: 'none' }} 
                    />
                    <label htmlFor="share-photo-capture" className="share-action-btn primary" style={{flex: 1}}>
                      {isUploadingShare ? '⏳ 처리 중...' : '📷 바로 촬영'}
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
                      {isUploadingShare ? '⏳ 처리 중...' : '📁 갤러리(스샷)'}
                    </label>
                  </div>
                  
                  <button className="share-action-btn secondary" onClick={handleGetLocation}>
                    📍 내 위치 지도 보기 (스샷용)
                  </button>
                </div>

                <div className="share-preview-grid">
                  {sharePhotos.map((url, idx) => (
                    <div key={idx} className="share-preview-item">
                      <img src={url} alt="미리보기" onClick={() => setFullScreenData({ images: sharePhotos, currentIndex: idx })} />
                      <button className="share-preview-remove" onClick={() => removeSharePhoto(idx)}>✕</button>
                    </div>
                  ))}
                  {sharePhotos.length === 0 && (
                    <div className="empty-preview">추가된 사진이 없습니다.</div>
                  )}
                </div>

                <div className="share-write-footer">
                  <button className="share-cancel-btn" onClick={() => { setIsShareWriting(false); setSharePhotos([]); }}>
                    취소
                  </button>
                  <button className="share-submit-btn" onClick={submitSharePost} disabled={isUploadingShare || sharePhotos.length === 0}>
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
                const isAvailable = availableDates.includes(dateStr);
                const isSelected = selectedDates.includes(dateStr);
                
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
                onClick={() => setIsCalendarOpen(false)}
              >
                선택 완료
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 사진 크게 보기 모달 */}
      {fullScreenData.images && fullScreenData.images.length > 0 && (
        <div className="modal-overlay" onClick={() => setFullScreenData({images: [], currentIndex: 0})}>
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
              className="fullscreen-image" 
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
            <button className="close-fullscreen-btn" onClick={() => setFullScreenData({images: [], currentIndex: 0})}>✕ 닫기</button>
          </div>
        </div>
      )}

      {/* Bottom Navigation */}
      <nav className="bottom-nav">
        <button 
          className={`nav-item ${activeTab === 'search' ? 'active' : ''}`}
          onClick={() => setActiveTab('search')}
        >
          <span className="nav-icon">🔍</span>
          <span>검색</span>
        </button>
        <button 
          className={`nav-item ${activeTab === 'cart' ? 'active' : ''}`}
          onClick={() => setActiveTab('cart')}
        >
          <span className="nav-icon">🧾</span>
          <span>견적서</span>
          {cartItemsCount > 0 && (
            <span className="badge">{cartItemsCount > 99 ? '99+' : cartItemsCount}</span>
          )}
        </button>
        <button 
          className={`nav-item ${activeTab === 'status' ? 'active' : ''}`}
          onClick={() => setActiveTab('status')}
        >
          <span className="nav-icon">📋</span>
          <span>접수현황</span>
        </button>
        <button 
          className={`nav-item ${activeTab === 'share' ? 'active' : ''}`}
          onClick={() => setActiveTab('share')}
        >
          <span className="nav-icon">🤝</span>
          <span>폐가구공유</span>
        </button>
      </nav>
    </>
  )
}

export default App
