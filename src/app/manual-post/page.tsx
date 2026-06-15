"use client";

import { useState, useEffect } from 'react';

export default function ManualPostPage() {
  const [projects, setProjects] = useState<string[]>([]);
  const [floors, setFloors] = useState<string[]>([]);
  const [project, setProject] = useState('');
  const [postType, setPostType] = useState('NEW');
  const [rawText, setRawText] = useState('');
  const [parsedData, setParsedData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [postPreview, setPostPreview] = useState('');

  const [projectSearch, setProjectSearch] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const [searchingOldPrice, setSearchingOldPrice] = useState(false);
  const [oldPostsResult, setOldPostsResult] = useState<any>(null);

  // Fetch projects and floors from Google Sheets on page load
  useEffect(() => {
    fetch('/api/projects')
      .then(res => res.json())
      .then(data => {
        if (data.projects && data.projects.length > 0) {
          setProjects(data.projects);
        }
        if (data.floors && data.floors.length > 0) {
          setFloors(data.floors);
        }
      })
      .catch(err => console.error('Failed to load metadata:', err))
      .finally(() => setProjectsLoading(false));
  }, []);

  // Filter projects based on search
  const filteredProjects = projects.filter(p => 
    p.toLowerCase().includes(projectSearch.toLowerCase())
  );

  // Live preview update
  useEffect(() => {
    if (!parsedData) return;
    
    const debounce = setTimeout(async () => {
      try {
        const payload = { ...parsedData, postType, project };
        const res = await fetch('/api/build-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: payload })
        });
        const data = await res.json();
        if (data.preview) setPostPreview(data.preview);
      } catch (e) {
        console.error("Preview error", e);
      }
    }, 500);

    return () => clearTimeout(debounce);
  }, [parsedData, postType, project]);

  const handleParse = async () => {
    if (!project || !rawText) return alert('Select project and paste text');
    setLoading(true);
    try {
      const res = await fetch('/api/parse-row', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText, projectName: project })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setParsedData(data.parsed);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    if (!parsedData) return;
    setSending(true);
    try {
      const payload = { ...parsedData, postType, project };
      const res = await fetch('/api/send-telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: payload })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      alert('Sent to Review Group!');
      setRawText('');
      setParsedData(null);
      setPostPreview('');
      setOldPostsResult(null);
      setProject('');
      setProjectSearch('');
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSending(false);
    }
  };

  const updateField = (field: string, value: string) => {
    setParsedData((prev: any) => ({ ...prev, [field]: value }));
  };

  const [lastSearchedUnit, setLastSearchedUnit] = useState('');

  const handleSearchOldPrice = async (overrideUnit?: string) => {
    const unit = overrideUnit || parsedData?.code || parsedData?.unit;
    if (!unit) {
      if (!overrideUnit) alert("Please enter a Unit/Code first.");
      return;
    }
    setSearchingOldPrice(true);
    setOldPostsResult(null);
    try {
      const res = await fetch('/api/search-old-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unit })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      setOldPostsResult(data);
      
      // If exactly one post is found, auto-fill it
      if (data.posts && data.posts.length === 1) {
        if (data.extractedOldPrice) {
          setParsedData((prev: any) => ({ ...prev, oldPrice: data.extractedOldPrice, oldPostUrl: data.posts[0].url }));
        } else if (data.originalPrice) {
          // Fallback if we couldn't extract Selling Price
          setParsedData((prev: any) => ({ ...prev, oldPrice: data.originalPrice, oldPostUrl: data.posts[0].url }));
        }
      }
    } catch (e: any) {
      if (!overrideUnit) alert("Error searching: " + e.message);
    } finally {
      setSearchingOldPrice(false);
    }
  };

  useEffect(() => {
    if (!parsedData) return;
    if (postType !== 'PRICE_CHANGE' && postType !== 'NEW_PRICE') return;
    
    const unit = parsedData.code || parsedData.unit;
    if (unit && unit !== lastSearchedUnit) {
      setLastSearchedUnit(unit);
      handleSearchOldPrice(unit);
    }
  }, [parsedData?.code, parsedData?.unit, postType]);

  const isVilla = ['villa', 'townhouse', 'condo'].includes(String(parsedData?.objectType || '').toLowerCase());

  const convertRuToEn = (str: string) => {
    const ru = 'йцукенгшщзхъфывапролджэячсмитьбю.ЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ,';
    const en = 'qwertyuiop[]asdfghjkl;\'zxcvbnm,./QWERTYUIOP{}ASDFGHJKL:"ZXCVBNM<>?';
    let res = '';
    for (let i = 0; i < str.length; i++) {
      const idx = ru.indexOf(str[i]);
      res += idx !== -1 ? en[idx] : str[i];
    }
    return res;
  };

  return (
    <div className="max-w-6xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Manual Post Builder</h1>
        <p className="text-slate-400">Parse a single row and prepare it for Telegram.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Left Column: Input Form & Preview */}
        <div className="space-y-8">
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-white/5 backdrop-blur-xl relative overflow-hidden">
            <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent" />

            <div className="space-y-5">
              <div className="relative">
                <label className="block text-sm font-medium text-slate-300 mb-2">Project</label>
                {projectsLoading ? (
                  <div className="w-full px-4 py-3 bg-slate-950/50 border border-white/10 rounded-xl text-slate-500 flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-slate-500 border-t-transparent rounded-full animate-spin" />
                    Loading projects...
                  </div>
                ) : projects.length > 0 ? (
                  <div className="relative">
                    <input
                      type="text"
                      value={projectSearch}
                      onChange={(e) => {
                        const enVal = convertRuToEn(e.target.value);
                        setProjectSearch(enVal);
                        setIsDropdownOpen(true);
                      }}
                      onFocus={() => setIsDropdownOpen(true)}
                      onBlur={() => setTimeout(() => setIsDropdownOpen(false), 200)}
                      placeholder="Search project..."
                      className="w-full px-4 py-3 bg-slate-950/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all text-white placeholder-slate-500"
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
                      <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </div>
                    
                    {isDropdownOpen && (
                      <div className="absolute z-50 w-full mt-2 bg-slate-900 border border-white/10 rounded-xl shadow-xl shadow-black/50 max-h-60 overflow-y-auto overflow-x-hidden p-1 custom-scrollbar">
                        {filteredProjects.length > 0 ? (
                          filteredProjects.map((p) => (
                            <div
                              key={p}
                              onClick={() => {
                                setProject(p);
                                setProjectSearch(p);
                                setIsDropdownOpen(false);
                              }}
                              className={`px-3 py-2.5 rounded-lg cursor-pointer text-sm transition-colors ${project === p ? 'bg-indigo-500/20 text-indigo-300 font-medium' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
                            >
                              {p}
                            </div>
                          ))
                        ) : (
                          <div className="px-4 py-3 text-sm text-slate-500 text-center">No projects found</div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-full px-4 py-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">
                    Failed to load projects.
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Post Type</label>
                <select
                  value={postType}
                  onChange={(e) => setPostType(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-950/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all text-white appearance-none cursor-pointer"
                >
                  <option value="NEW">🔥 NEW</option>
                  <option value="HOT_PRICE">🔥 HOT PRICE</option>
                  <option value="DISTRESS">⚡ QUICK SALE</option>
                  <option value="NEW_PRICE">🔥 NEW PRICE</option>
                  <option value="READY_TO_MOVE">❗️ READY TO MOVE</option>
                  <option value="PRICE_CHANGE">❗️ PRICE CHANGE</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Paste Row (from Canva/Sheets)</label>
                <textarea
                  rows={4}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-950/50 border border-white/10 rounded-xl focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all text-white placeholder-slate-500 font-mono text-sm"
                  placeholder="Paste TSV row here..."
                />
              </div>

              <button
                onClick={handleParse}
                disabled={loading || !project}
                className="w-full bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white font-medium py-3 px-6 rounded-xl transition-all shadow-lg shadow-indigo-500/25 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
              >
                {loading ? 'Parsing...' : 'Parse Data'}
              </button>
            </div>
          </div>

          {postPreview && (
            <div className="p-6 rounded-2xl bg-slate-900/40 border border-white/5 backdrop-blur-md">
              <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live Telegram Preview
              </h3>
              <div className="prose prose-invert max-w-none">
                {/* Render the HTML directly so bold/italic tags display correctly */}
                <div 
                  className="whitespace-pre-wrap font-sans text-[15px] text-slate-200 bg-slate-950/50 p-6 rounded-xl border border-white/5 leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: postPreview.replace(/\n/g, '<br/>') }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Parsed Data Editor */}
        {parsedData && (
          <div className="p-6 rounded-2xl bg-slate-900/40 border border-white/5 backdrop-blur-md space-y-6 h-fit">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                Edit Parsed Data
              </h3>
              <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 uppercase tracking-wider">
                {parsedData.objectType} Format
              </span>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Unit / Code</label>
                  <input type="text" value={parsedData.code || parsedData.unit} onChange={(e) => updateField('code', e.target.value)} className="w-full px-3 py-2 bg-slate-950/50 border border-white/10 rounded-lg text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/50" />
                </div>
                {postType !== 'PRICE_CHANGE' && (
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Type</label>
                    <input type="text" value={parsedData.type} onChange={(e) => updateField('type', e.target.value)} className="w-full px-3 py-2 bg-slate-950/50 border border-white/10 rounded-lg text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/50" />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Selling Price (AED)</label>
                  <input type="text" value={parsedData.sellingPrice} onChange={(e) => updateField('sellingPrice', e.target.value)} className="w-full px-3 py-2 bg-slate-950/50 border border-white/10 rounded-lg text-sm text-emerald-400 font-medium outline-none focus:ring-2 focus:ring-indigo-500/50" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Original Price (AED)</label>
                  <input type="text" value={parsedData.originalPrice || ''} onChange={(e) => updateField('originalPrice', e.target.value)} className="w-full px-3 py-2 bg-slate-950/50 border border-white/10 rounded-lg text-sm text-slate-300 outline-none focus:ring-2 focus:ring-indigo-500/50" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                {(postType === 'NEW_PRICE' || postType === 'PRICE_CHANGE') ? (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs text-slate-400">Old Price (AED)</label>
                      <button 
                        onClick={() => handleSearchOldPrice()}
                        disabled={searchingOldPrice}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                      >
                        {searchingOldPrice ? 'Searching...' : '🔍 Find in Channel'}
                      </button>
                    </div>
                    <input type="text" value={parsedData.oldPrice || ''} onChange={(e) => updateField('oldPrice', e.target.value)} className="w-full px-3 py-2 bg-slate-950/50 border border-white/10 rounded-lg text-sm text-rose-400 outline-none focus:ring-2 focus:ring-indigo-500/50" placeholder="Required" />
                    
                    {oldPostsResult && (
                      <div className="mt-3 p-3 bg-slate-950/50 border border-white/5 rounded-lg max-h-60 overflow-y-auto custom-scrollbar">
                        <div className="text-xs text-slate-400 mb-2">Original Price: <strong className="text-white">{oldPostsResult.originalPrice || 'Not found'}</strong></div>
                        {oldPostsResult.posts?.length > 0 ? (
                          <div className="space-y-2">
                            {oldPostsResult.posts.map((post: any) => (
                              <div key={post.id} className="p-2 bg-slate-900 border border-white/5 rounded relative">
                                {post.date && <div className="absolute top-2 right-2 text-[9px] text-slate-500/70">{post.date}</div>}
                                <p className="text-[10px] text-slate-400 line-clamp-3 mb-2 pr-12">{post.text}</p>
                                <div className="flex items-center justify-between">
                                  <a href={post.url} target="_blank" rel="noreferrer" className="text-[10px] text-blue-400 hover:underline">View Post</a>
                                  <button onClick={() => {
                                    updateField('oldPrice', post.extractedSellingPrice || oldPostsResult.originalPrice);
                                    updateField('oldPostUrl', post.url);
                                  }} className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded hover:bg-indigo-500/40">
                                    Use Price {post.extractedSellingPrice ? `(${post.extractedSellingPrice})` : ''}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[10px] text-rose-400">No posts found.</div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div></div> /* Empty div to keep grid layout */
                )}

                {postType !== 'PRICE_CHANGE' && (
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Approx. Rental Rate</label>
                    <input type="text" value={parsedData.approxRentalRate || ''} onChange={(e) => updateField('approxRentalRate', e.target.value)} className="w-full px-3 py-2 bg-slate-950/50 border border-white/10 rounded-lg text-sm text-slate-300 outline-none focus:ring-2 focus:ring-indigo-500/50" placeholder="e.g. 10%" />
                  </div>
                )}
              </div>

              {postType !== 'PRICE_CHANGE' && (
                <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-4">
                  {!isVilla && (
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Area (sqm)</label>
                      <input type="text" value={parsedData.areaM2 || ''} onChange={(e) => updateField('areaM2', e.target.value)} className="w-full px-3 py-2 bg-slate-950/50 border border-white/10 rounded-lg text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/50" />
                    </div>
                  )}
                  {isVilla && (
                    <>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Gross Area (sqm)</label>
                        <input type="text" value={parsedData.grossAreaM2 || ''} onChange={(e) => updateField('grossAreaM2', e.target.value)} className="w-full px-3 py-2 bg-slate-950/50 border border-white/10 rounded-lg text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/50" />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Plot Area (sqm)</label>
                        <input type="text" value={parsedData.plotAreaM2 || ''} onChange={(e) => updateField('plotAreaM2', e.target.value)} className="w-full px-3 py-2 bg-slate-950/50 border border-white/10 rounded-lg text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/50" />
                      </div>
                    </>
                  )}
                  {!isVilla && (
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">Floor</label>
                      {floors.length > 0 ? (
                        <select
                          value={parsedData.floor || ''}
                          onChange={(e) => updateField('floor', e.target.value)}
                          className="w-full px-3 py-2 bg-slate-950/50 border border-white/10 rounded-lg text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/50 appearance-none cursor-pointer"
                        >
                          <option value="">Select floor...</option>
                          {floors.map((f, idx) => (
                            <option key={idx} value={f}>{f}</option>
                          ))}
                        </select>
                      ) : (
                        <input type="text" value={parsedData.floor || ''} onChange={(e) => updateField('floor', e.target.value)} className="w-full px-3 py-2 bg-slate-950/50 border border-white/10 rounded-lg text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/50" />
                      )}
                    </div>
                  )}
                </div>
              )}

              {postType !== 'PRICE_CHANGE' && (
                <div className="grid grid-cols-2 gap-4">
                  {!isVilla && (
                    <div>
                      <label className="block text-xs text-slate-400 mb-1">View</label>
                      <input type="text" value={parsedData.view || ''} onChange={(e) => updateField('view', e.target.value)} className="w-full px-3 py-2 bg-slate-950/50 border border-white/10 rounded-lg text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/50" />
                    </div>
                  )}
                  <div className={isVilla ? "col-span-2" : ""}>
                    <label className="block text-xs text-slate-400 mb-1">Handover</label>
                    <input type="text" value={parsedData.handover || ''} onChange={(e) => updateField('handover', e.target.value)} className="w-full px-3 py-2 bg-slate-950/50 border border-white/10 rounded-lg text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/50" />
                  </div>
                </div>
              )}

              {isVilla && (
                <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-4">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Row Name</label>
                    <input type="text" value={parsedData.rowName || ''} onChange={(e) => updateField('rowName', e.target.value)} className="w-full px-3 py-2 bg-slate-950/50 border border-white/10 rounded-lg text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/50" />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Unit</label>
                    <input type="text" value={parsedData.unit || ''} onChange={(e) => updateField('unit', e.target.value)} className="w-full px-3 py-2 bg-slate-950/50 border border-white/10 rounded-lg text-sm text-white outline-none focus:ring-2 focus:ring-indigo-500/50" />
                  </div>
                </div>
              )}

              {postType !== 'PRICE_CHANGE' && (
                <div className="pt-4 border-t border-white/5">
                  <label className="block text-sm font-medium text-slate-300 mb-2">Slide Image</label>
                  
                  {parsedData.slideDataUrl ? (
                    <div className="relative w-full h-48 rounded-xl overflow-hidden border border-white/10 mb-3 group">
                      <img src={parsedData.slideDataUrl} alt="Slide preview" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <button 
                          onClick={() => updateField('slideDataUrl', '')}
                          className="bg-rose-500 hover:bg-rose-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                        >
                          Remove Image
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-white/20 rounded-xl hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all cursor-pointer">
                      <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        <svg className="w-8 h-8 mb-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                        <p className="mb-2 text-sm text-slate-400"><span className="font-semibold text-indigo-400">Click to upload</span> or drag and drop</p>
                        <p className="text-xs text-slate-500">JPG, PNG or WEBP (Canva slide)</p>
                      </div>
                      <input 
                        type="file" 
                        className="hidden" 
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            if (event.target?.result) {
                              // Ensure we also save the filename so the API can use it
                              setParsedData({
                                ...parsedData,
                                slideDataUrl: event.target.result as string,
                                slideName: file.name
                              });
                            }
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                    </label>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={handleSend}
              disabled={sending}
              className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-medium py-3 px-6 rounded-xl transition-all shadow-lg shadow-emerald-500/25 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none mt-6"
            >
              {sending ? 'Sending to Review Group...' : 'Send to Telegram'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
