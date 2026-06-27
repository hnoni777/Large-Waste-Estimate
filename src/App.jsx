import { useState, useMemo } from 'react'
import data from '../data.json'
import * as XLSX from 'xlsx'
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
          phone: row['휴대폰'],
          address: row['주소'],
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
          {activeTab === 'cart' && '🧾 견적서 작성'}
          {activeTab === 'status' && '📋 접수현황 관리'}
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
                    {dateObj.groups.map((group) => (
                      <div key={group.id} className="status-card">
                        <div className="status-header">
                          <div className="status-badge">배출번호: {group.id}</div>
                          <div className="status-contact">📞 {group.phone}</div>
                        </div>
                        <div className="status-address">📍 {group.address}</div>
                        <div className="status-items">
                          {group.items.map((item, idx) => (
                            <div key={idx} className="status-item-row">
                              <span className="s-item-name">{item.item}</span>
                              <span className="s-item-spec">{item.spec}</span>
                              <span className="s-item-qty">x{item.qty}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
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
          <span>폐가구접수현황</span>
        </button>
      </nav>
    </>
  )
}

export default App
