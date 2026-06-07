"use client";

import { useState } from 'react';

export default function ReducedPricePage() {
  const [project, setProject] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [posts, setPosts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!project || !originalPrice) return alert('Enter project and original price');
    setLoading(true);
    try {
      const res = await fetch('/api/reduced/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalPrice, projectName: project })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPosts(data.posts);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight text-white">Reduced Price Flow</h2>
        <p className="text-zinc-400">Search for old Telegram posts using MTProto (GramJS).</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Project</label>
            <input 
              type="text" 
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md p-2 text-white" 
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1">Original Price (from sheet)</label>
            <input 
              type="text" 
              value={originalPrice}
              onChange={(e) => setOriginalPrice(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md p-2 text-white" 
            />
          </div>
        </div>

        <button 
          onClick={handleSearch}
          disabled={loading}
          className="bg-blue-600 hover:bg-blue-500 text-white font-semibold py-2 px-4 rounded-md transition-colors"
        >
          {loading ? 'Searching...' : 'Search Telegram'}
        </button>
      </div>

      {posts.length > 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
          <h3 className="text-lg font-medium text-white">Candidates found ({posts.length})</h3>
          <div className="space-y-4">
            {posts.map(post => (
              <div key={post.id} className="bg-zinc-950 p-4 rounded border border-zinc-800">
                <p className="text-sm text-zinc-400 mb-2">{post.date}</p>
                <p className="text-sm text-white whitespace-pre-wrap">{post.text}</p>
                <a href={post.link} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline text-sm mt-2 block">
                  Open in Telegram
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
