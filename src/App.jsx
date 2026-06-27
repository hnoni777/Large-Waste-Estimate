import { useState, useMemo } from 'react'
import data from '../data.json'
import * as XLSX from 'xlsx'
import './index.css'

function App() {
  const [activeTab, setActiveTab] = useState('search') // 'search', 'cart', 'status'
  const [searchTerm, setSearchTerm] = useState('')
  const [cart, setCart] = useState([])
  
  // 배출현황 데이터 상태 (배출번호별 그룹 배열)
  const [statusData, setStatusData] = useState([])
  const [fileName, setFileName] = useState('')

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
      
      // 당일 날짜 필터링을 위한 오늘 날짜 구하기 (YYYY-MM-DD 형식)
      const dt = new Date();
      const todayStr = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
      
      const filtered = parsedData.filter(row => {
        const d = row['신청일자'];
        if (d instanceof Date) {
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, '0');
          const dd = String(d.getDate()).padStart(2, '0');
          const dateStr = `${yyyy}-${mm}-${dd}`;
          return dateStr === todayStr;
        }
        return false;
      });

      // 배출번호 기준으로 묶기
      const grouped = {};
      filtered.forEach(row => {
        const id = row['배출번호'];
        if (!id) return; // 배출번호가 없으면 무시
        
        if (!grouped[id]) {
          grouped[id] = {
            id,
            phone: row['휴대폰'],
            address: row['주소'],
            items: []
          };
        }
        grouped[id].items.push({
          item: row['품목'],
          spec: row['규격'],
          qty: row['신청수량'] || 1
        });
      });

      setStatusData(Object.values(grouped));
    };
    reader.readAsBinaryString(file);
  };

  return (
    <>
      <header className="app-header">
        <h1 className="app-title">대형폐기물 견적</h1>
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

        {/* === STATUS TAB (배출현황) === */}
        {activeTab === 'status' && (
          <div className="tab-status">
            <div className="upload-wrapper">
              <label className="upload-btn">
                엑셀 파일 불러오기
                <input 
                  type="file" 
                  accept=".xls,.xlsx" 
                  onChange={handleFileUpload}
                  style={{ display: 'none' }} 
                />
              </label>
              {fileName && <p className="file-name">선택된 파일: {fileName}</p>}
            </div>

            <div className="list-container">
              {statusData.length === 0 ? (
                <div className="empty-state">
                  오늘 날짜의 배출 신청 건이 없습니다.<br/>
                  (엑셀 파일을 업로드해 주세요)
                </div>
              ) : (
                statusData.map((group) => (
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
                ))
              )}
            </div>
          </div>
        )}
      </main>

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
          <span>현황</span>
        </button>
      </nav>
    </>
  )
}

export default App
