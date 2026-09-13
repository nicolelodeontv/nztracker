import { useEffect, useState } from 'react';

export default function ClanRanking() {
  const [clans, setClans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch clans from API
  const fetchClans = async () => {
    try {
      setError(null);
      const res = await fetch('/api/clans?limit=100&includeHistory=false');
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      if (data.success) {
        setClans(data.clans);
        setLastUpdated(new Date(data.lastUpdated));
      } else {
        setError(data.error || 'Failed to fetch clans');
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch
  useEffect(() => {
    fetchClans();
  }, []);

  // Auto-refresh every 30 seconds if enabled
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchClans, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  const formatTime = (date) => {
    if (!date) return '—';
    return new Date(date).toLocaleTimeString();
  };

  const formatReputation = (rep) => {
    return rep?.toLocaleString() || '—';
  };

  return (
    <div className="clan-ranking">
      {/* Status Bar */}
      <div className="status-bar">
        <div className="status-info">
          {loading ? (
            <>
              <span className="status-badge syncing">⏳ Syncing...</span>
              <span>Fetching latest rankings...</span>
            </>
          ) : error ? (
            <>
              <span className="status-badge error">⚠️ Error</span>
              <span>{error}</span>
            </>
          ) : (
            <>
              <span className="status-badge success">✓ Synced</span>
              <span>Last updated: {formatTime(lastUpdated)}</span>
              <span className="clan-count">({clans.length} clans)</span>
            </>
          )}
        </div>

        <div className="status-controls">
          <button
            onClick={fetchClans}
            disabled={loading}
            className="btn btn-small"
          >
            🔄 Refresh
          </button>
          <label className="auto-refresh">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto-refresh
          </label>
        </div>
      </div>

      {/* Clans Table */}
      <div className="clans-table-container">
        {clans.length > 0 ? (
          <table className="clans-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Clan</th>
                <th>Master</th>
                <th>Members</th>
                <th>Reputation</th>
              </tr>
            </thead>
            <tbody>
              {clans.map((clan, idx) => (
                <tr key={idx} className="clan-row">
                  <td className="rank">{clan.rank}</td>
                  <td className="name">
                    <a href={`#clan/${clan.name}`} className="clan-link">
                      {clan.name}
                    </a>
                  </td>
                  <td className="master">{clan.master || '—'}</td>
                  <td className="members">{clan.members || '—'}</td>
                  <td className="reputation">{formatReputation(clan.reputation)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : !loading && !error ? (
          <div className="empty-state">
            <p>No clan data available. Waiting for first sync...</p>
          </div>
        ) : null}
      </div>

      {/* Styles */}
      <style jsx>{`
        .clan-ranking {
          padding: 1rem;
        }

        .status-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
          padding: 1rem;
          background: var(--bg-secondary, #f5f5f5);
          border-radius: 8px;
          gap: 1rem;
        }

        .status-info {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.9rem;
        }

        .status-badge {
          display: inline-block;
          padding: 0.25rem 0.75rem;
          border-radius: 20px;
          font-weight: 600;
          font-size: 0.85rem;
        }

        .status-badge.syncing {
          background: #ffc107;
          color: #000;
        }

        .status-badge.success {
          background: #28a745;
          color: #fff;
        }

        .status-badge.error {
          background: #dc3545;
          color: #fff;
        }

        .clan-count {
          color: var(--text-secondary, #666);
          font-size: 0.85rem;
        }

        .status-controls {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .btn-small {
          padding: 0.5rem 1rem;
          font-size: 0.9rem;
          border: none;
          border-radius: 4px;
          background: var(--primary, #007bff);
          color: #fff;
          cursor: pointer;
          transition: opacity 0.2s;
        }

        .btn-small:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-small:hover:not(:disabled) {
          opacity: 0.9;
        }

        .auto-refresh {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          font-size: 0.9rem;
        }

        .auto-refresh input {
          cursor: pointer;
        }

        .clans-table-container {
          overflow-x: auto;
        }

        .clans-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 0.95rem;
        }

        .clans-table thead {
          background: var(--bg-secondary, #f5f5f5);
          font-weight: 600;
        }

        .clans-table th {
          padding: 0.75rem;
          text-align: left;
          border-bottom: 2px solid var(--border-color, #ddd);
        }

        .clans-table td {
          padding: 0.75rem;
          border-bottom: 1px solid var(--border-color, #eee);
        }

        .clan-row:hover {
          background: var(--bg-hover, #f9f9f9);
        }

        .rank {
          font-weight: 600;
          color: var(--primary, #007bff);
          min-width: 50px;
        }

        .name {
          font-weight: 500;
        }

        .clan-link {
          color: var(--primary, #007bff);
          text-decoration: none;
          cursor: pointer;
        }

        .clan-link:hover {
          text-decoration: underline;
        }

        .reputation {
          text-align: right;
          font-family: monospace;
          color: var(--text-secondary, #666);
        }

        .empty-state {
          text-align: center;
          padding: 2rem;
          color: var(--text-secondary, #666);
        }

        @media (max-width: 768px) {
          .status-bar {
            flex-direction: column;
            align-items: flex-start;
          }

          .status-controls {
            width: 100%;
            justify-content: space-between;
          }

          .clans-table {
            font-size: 0.85rem;
          }

          .clans-table th,
          .clans-table td {
            padding: 0.5rem;
          }
        }
      `}</style>
    </div>
  );
}
