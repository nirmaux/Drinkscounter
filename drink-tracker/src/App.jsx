import React, { useState, useEffect } from 'react';
import { Plus, Minus, Download, Trophy, Users, RefreshCw, History, X, UserPlus, LogIn, LogOut, Dices, BarChart3, Clock } from 'lucide-react';
import { supabase } from './supabaseClient';

export default function DrinkTracker() {
  const [session, setSession] = useState(null);
  const [people, setPeople] = useState([]);
  const [newPersonName, setNewPersonName] = useState('');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [sessionHistory, setSessionHistory] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [accountMode, setAccountMode] = useState('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [canRollDice, setCanRollDice] = useState(false);
  const [timeUntilRoll, setTimeUntilRoll] = useState(0);
  const [diceResult, setDiceResult] = useState(null);
  const [isRolling, setIsRolling] = useState(false);
  const [showStats, setShowStats] = useState(false);
  const [userStats, setUserStats] = useState(null);

  useEffect(() => {
    loadCurrentUser();
    loadSession();
    
    const channel = supabase
      .channel('session-changes')
      .on('postgres_changes', 
        { event: '*', schema: 'public', table: 'sessions', filter: 'is_current=eq.true' },
        (payload) => {
          if (payload.new && payload.new.is_current) {
            setSession(payload.new);
            setPeople(payload.new.people || []);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      if (session?.last_roll_time) {
        const elapsed = Date.now() - new Date(session.last_roll_time).getTime();
        const remaining = (15 * 60 * 1000) - elapsed;
        
        if (remaining <= 0) {
          setCanRollDice(true);
          setTimeUntilRoll(0);
        } else {
          setCanRollDice(false);
          setTimeUntilRoll(remaining);
        }
      } else {
        setCanRollDice(true);
        setTimeUntilRoll(0);
      }
    }, 1000);
    
    return () => clearInterval(interval);
  }, [session]);

  const loadCurrentUser = () => {
    const user = localStorage.getItem('drinkTracker_user');
    if (user) {
      setCurrentUser(JSON.parse(user));
    }
  };

  const loadSession = async () => {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('is_current', true)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      
      if (data) {
        setSession(data);
        setPeople(data.people || []);
      }
    } catch (error) {
      console.error('Error loading session:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('sessions')
        .select('*')
        .eq('is_current', false)
        .not('archived_at', 'is', null)
        .order('archived_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      setSessionHistory(data || []);
    } catch (error) {
      console.error('Error loading history:', error);
    }
  };

  const loadUserStats = async (username) => {
    try {
      const { data: sessions, error } = await supabase
        .from('sessions')
        .select('*')
        .not('archived_at', 'is', null);

      if (error) throw error;

      let totalDrinks = 0;
      let sessionsParticipated = 0;

      sessions.forEach(session => {
        const userInSession = session.people.find(p => p.username === username);
        if (userInSession) {
          totalDrinks += userInSession.drinks;
          sessionsParticipated++;
        }
      });

      const currentPerson = people.find(p => p.username === username);
      if (currentPerson) {
        totalDrinks += currentPerson.drinks;
        sessionsParticipated++;
      }

      setUserStats({
        totalDrinks,
        sessionsParticipated,
        averagePerSession: sessionsParticipated > 0 ? (totalDrinks / sessionsParticipated).toFixed(1) : 0
      });
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const createAccount = async () => {
    if (!username.trim() || !displayName.trim()) {
      alert('Please enter both username and display name');
      return;
    }

    try {
      const { data: existingUser } = await supabase
        .from('users')
        .select('*')
        .eq('username', username.toLowerCase())
        .maybeSingle();

      if (existingUser) {
        alert('Username already exists. Please choose another or login.');
        return;
      }

      const { data, error } = await supabase
        .from('users')
        .insert([
          { username: username.toLowerCase(), display_name: displayName.trim() }
        ])
        .select()
        .single();

      if (error) throw error;

      const userAccount = {
        username: data.username,
        displayName: data.display_name
      };

      localStorage.setItem('drinkTracker_user', JSON.stringify(userAccount));
      setCurrentUser(userAccount);
      setShowAccountModal(false);
      setUsername('');
      setDisplayName('');
      alert('Account created successfully!');
    } catch (error) {
      console.error('Error creating account:', error);
      alert('Failed to create account. Please try again.');
    }
  };

  const loginAccount = async () => {
    if (!username.trim()) {
      alert('Please enter a username');
      return;
    }

    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username.toLowerCase())
        .maybeSingle();

      if (error || !data) {
        alert('Account not found. Please create an account first.');
        return;
      }

      const userAccount = {
        username: data.username,
        displayName: data.display_name
      };

      localStorage.setItem('drinkTracker_user', JSON.stringify(userAccount));
      setCurrentUser(userAccount);
      setShowAccountModal(false);
      setUsername('');
      alert(`Welcome back, ${userAccount.displayName}!`);
    } catch (error) {
      console.error('Error logging in:', error);
      alert('Failed to login. Please try again.');
    }
  };

  const logoutAccount = () => {
    if (confirm('Are you sure you want to logout?')) {
      localStorage.removeItem('drinkTracker_user');
      setCurrentUser(null);
    }
  };

  const viewMyStats = async () => {
    if (!currentUser) {
      alert('Please login to view your stats!');
      return;
    }
    await loadUserStats(currentUser.username);
    setShowStats(true);
  };

  const joinSession = async () => {
    if (!currentUser) {
      alert('Please login or create an account first!');
      setShowAccountModal(true);
      return;
    }

    if (people.some(p => p.username === currentUser.username)) {
      alert("You're already in this session!");
      return;
    }

    const newPerson = {
      id: Date.now().toString(),
      name: currentUser.displayName,
      username: currentUser.username,
      drinks: 0
    };

    const updated = [...people, newPerson];
    await saveSession(updated);
  };

  const saveSession = async (updatedPeople, updatedRollTime = session?.last_roll_time) => {
    setSyncing(true);
    try {
      if (session) {
        const { error } = await supabase
          .from('sessions')
          .update({
            people: updatedPeople,
            last_updated: new Date().toISOString(),
            last_roll_time: updatedRollTime
          })
          .eq('id', session.id);

        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('sessions')
          .insert([{
            people: updatedPeople,
            is_current: true,
            last_roll_time: updatedRollTime
          }])
          .select()
          .single();

        if (error) throw error;
        setSession(data);
      }
      
      setPeople(updatedPeople);
    } catch (error) {
      console.error('Error saving session:', error);
      alert('Failed to sync data. Please try again.');
    } finally {
      setSyncing(false);
    }
  };

  const rollDice = async () => {
    if (!canRollDice) {
      alert(`Wait ${Math.floor(timeUntilRoll / 60000)} more minutes before rolling!`);
      return;
    }

    const sortedPeople = [...people].sort((a, b) => b.drinks - a.drinks);
    if (sortedPeople.length === 0) return;

    const topPerson = sortedPeople[0];
    if (currentUser?.username !== topPerson.username) {
      alert(`Only ${topPerson.name} (the leader) can roll the dice!`);
      return;
    }

    setIsRolling(true);
    let rolls = 0;
    const rollInterval = setInterval(() => {
      setDiceResult(Math.floor(Math.random() * 6) + 1);
      rolls++;
      if (rolls >= 10) {
        clearInterval(rollInterval);
        const finalResult = Math.floor(Math.random() * 6) + 1;
        setDiceResult(finalResult);
        setIsRolling(false);
        
        const now = new Date().toISOString();
        saveSession(people, now);
        
        setTimeout(() => setDiceResult(null), 5000);
      }
    }, 100);
  };

  const addPerson = async () => {
    if (!newPersonName.trim()) return;
    
    const newPerson = {
      id: Date.now().toString(),
      name: newPersonName.trim(),
      drinks: 0
    };
    
    const updated = [...people, newPerson];
    await saveSession(updated);
    setNewPersonName('');
  };

  const updateDrinks = async (personId, change) => {
    const updated = people.map(p => 
      p.id === personId 
        ? { ...p, drinks: Math.max(0, Math.round((p.drinks + change) * 2) / 2) }
        : p
    );
    await saveSession(updated);
  };

  const removePerson = async (personId) => {
    if (!confirm('Remove this person from the session?')) return;
    const updated = people.filter(p => p.id !== personId);
    await saveSession(updated);
  };

  const endSession = async () => {
    if (people.length === 0) {
      alert('No active session to end');
      return;
    }
    
    if (!confirm('End this session? This will archive it and clear the current session.')) return;
    
    try {
      await supabase
        .from('sessions')
        .update({
          is_current: false,
          archived_at: new Date().toISOString()
        })
        .eq('id', session.id);

      setSession(null);
      setPeople([]);
      alert('Session ended and archived!');
    } catch (error) {
      console.error('Error ending session:', error);
      alert('Failed to end session. Please try again.');
    }
  };

  const startNewSession = async () => {
    if (!confirm('Start a new session? This will archive the current session if there is one.')) return;
    
    try {
      if (session) {
        await supabase
          .from('sessions')
          .update({
            is_current: false,
            archived_at: new Date().toISOString()
          })
          .eq('id', session.id);
      }

      setSession(null);
      setPeople([]);
    } catch (error) {
      console.error('Error starting new session:', error);
      alert('Failed to start new session. Please try again.');
    }
  };

  const exportToCSV = () => {
    if (people.length === 0) return;
    
    const headers = ['Name', 'Drinks'];
    const rows = people.map(p => [p.name, p.drinks]);
    
    const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `drinks-session-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportHistorySession = (historySession) => {
    const headers = ['Name', 'Drinks'];
    const rows = historySession.people.map(p => [p.name, p.drinks]);
    
    const csv = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const date = new Date(historySession.archived_at).toISOString().split('T')[0];
    a.download = `drinks-session-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const viewHistory = async () => {
    await loadHistory();
    setShowHistory(true);
  };

  const formatTime = (ms) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const sortedPeople = [...people].sort((a, b) => b.drinks - a.drinks);
  const totalDrinks = people.reduce((sum, p) => sum + p.drinks, 0);
  const topPerson = sortedPeople[0];

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 flex items-center justify-center">
        <div className="text-amber-900 text-xl font-bold">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 p-4">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h1 className="text-3xl font-bold flex items-center gap-2 text-amber-900">
              🍺 Drink Tracker
              {syncing && <RefreshCw className="w-5 h-5 animate-spin" />}
            </h1>
            <div className="flex gap-2 flex-wrap">
              {currentUser ? (
                <>
                  <button onClick={viewMyStats} className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors flex items-center gap-2">
                    <BarChart3 className="w-4 h-4" />
                    My Stats
                  </button>
                  <div className="px-4 py-2 bg-green-100 text-green-800 rounded-lg flex items-center gap-2">
                    <span className="text-sm font-medium">👤 {currentUser.displayName}</span>
                    <button onClick={logoutAccount} className="hover:text-red-600" title="Logout">
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                </>
              ) : (
                <button onClick={() => setShowAccountModal(true)} className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors flex items-center gap-2">
                  <LogIn className="w-4 h-4" />
                  Login / Sign Up
                </button>
              )}
              <button onClick={viewHistory} className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-colors flex items-center gap-2">
                <History className="w-4 h-4" />
                History
              </button>
              {people.length > 0 && (
                <button onClick={endSession} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors">
                  End Session
                </button>
              )}
              <button onClick={startNewSession} className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors">
                New Session
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4 text-center">
            <div className="bg-amber-50 rounded-xl p-4">
              <Users className="w-6 h-6 mx-auto mb-1 text-amber-700" />
              <div className="text-2xl font-bold text-amber-900">{people.length}</div>
              <div className="text-sm text-amber-700">People</div>
            </div>
            <div className="bg-amber-50 rounded-xl p-4">
              <Trophy className="w-6 h-6 mx-auto mb-1 text-amber-700" />
              <div className="text-2xl font-bold text-amber-900">{totalDrinks}</div>
              <div className="text-sm text-amber-700">Total Drinks</div>
            </div>
          </div>
        </div>

        {people.length > 0 && topPerson && (
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-5 h-5 text-amber-700" />
                  <h3 className="font-bold text-amber-900">Dice Roll</h3>
                </div>
                {canRollDice ? (
                  <p className="text-green-600 font-medium">🎲 {topPerson.name} can roll the dice!</p>
                ) : (
                  <p className="text-amber-700">Next roll in: <span className="font-bold">{formatTime(timeUntilRoll)}</span></p>
                )}
              </div>
              {currentUser?.username === topPerson?.username && (
                <button onClick={rollDice} disabled={!canRollDice || isRolling} className={`px-6 py-3 rounded-lg font-bold text-white transition-all flex items-center gap-2 ${canRollDice && !isRolling ? 'bg-green-500 hover:bg-green-600 transform hover:scale-105' : 'bg-gray-400 cursor-not-allowed'}`}>
                  <Dices className="w-5 h-5" />
                  {isRolling ? 'Rolling...' : 'Roll Dice'}
                </button>
              )}
            </div>
            {diceResult && (
              <div className="mt-4 text-center bg-amber-50 rounded-xl p-6">
                <div className="text-6xl font-bold text-amber-900 animate-bounce">🎲 {diceResult}</div>
                <p className="mt-2 text-amber-700 font-medium">{topPerson.name} rolled a {diceResult}!</p>
              </div>
            )}
          </div>
        )}

        {currentUser && (
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
            <button onClick={joinSession} className="w-full py-4 bg-gradient-to-r from-green-500 to-blue-500 hover:from-green-600 hover:to-blue-600 text-white rounded-xl transition-all font-bold text-lg flex items-center justify-center gap-2 shadow-md">
              <UserPlus className="w-6 h-6" />
              Join Session as {currentUser.displayName}
            </button>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <h2 className="text-xl font-bold text-amber-900 mb-4">Add Person Manually</h2>
          <div className="flex gap-3">
            <input type="text" value={newPersonName} onChange={(e) => setNewPersonName(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && addPerson()} placeholder="Enter name..." className="flex-1 px-4 py-2 rounded-lg border-2 border-amber-200 focus:border-amber-500 focus:outline-none text-amber-900" />
            <button onClick={addPerson} className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors font-medium">
              Add
            </button>
          </div>
        </div>

        {people.length > 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-amber-900 flex items-center gap-2">
                <Trophy className="w-6 h-6 text-amber-600" />
                Leaderboard
              </h2>
              <button onClick={exportToCSV} className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors">
                <Download className="w-4 h-4" />
                Export CSV
              </button>
            </div>
            
            <div className="space-y-3">
              {sortedPeople.map((person, index) => (
                <div key={person.id} className={`rounded-xl p-4 flex items-center justify-between transition-all ${index === 0 ? 'bg-gradient-to-r from-yellow-100 to-amber-100 border-2 border-amber-400' : 'bg-amber-50'}`}>
                  <div className="flex items-center gap-4 flex-1">
                    <div className="text-2xl font-bold text-amber-600 w-8">{index === 0 ? '👑' : `#${index + 1}`}</div>
                    <div className="flex-1">
                      <div className="text-amber-900 font-bold text-lg flex items-center gap-2 flex-wrap">
                        {person.name}
                        {person.username && <span className="text-xs bg-green-200 text-green-800 px-2 py-1 rounded font-normal">@{person.username}</span>}
                      </div>
                    </div>
                    <div className="text-3xl font-bold text-amber-900">{person.drinks}</div>
                  </div>
                  
                  <div className="flex items-center gap-2 ml-4">
                    <button onClick={() => updateDrinks(person.id, -1)} className="p-2 bg-red-500 hover:bg-red-600 rounded-lg transition-colors">
                      <Minus className="w-5 h-5 text-white" />
                    </button>
                    <button onClick={() => updateDrinks(person.id, 0.5)} className="px-3 py-2 bg-green-400 hover:bg-green-500 rounded-lg transition-colors text-white font-bold text-sm">
                      +0.5
                    </button>
                    <button onClick={() => updateDrinks(person.id, 1)} className="px-3 py-2 bg-green-500 hover:bg-green-600 rounded-lg transition-colors text-white font-bold text-sm">
                      +1
                    </button>
                    <button onClick={() => removePerson(person.id)} className="p-2 bg-gray-500 hover:bg-gray-600 rounded-lg transition-colors ml-2">
                      <X className="w-5 h-5 text-white" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {people.length === 0 && (
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
            <Users className="w-16 h-16 mx-auto mb-4 text-amber-400" />
            <p className="text-xl text-amber-900">{currentUser ? "Click 'Join Session' to get started, or add people manually!" : "Login and join the session, or add people manually!"}</p>
          </div>
        )}

        <div className="text-center text-amber-800 text-sm mt-6 font-medium">💡 Data syncs automatically across all devices in real-time</div>
      </div>

      {showStats && userStats && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-amber-900 flex items-center gap-2">
                <BarChart3 className="w-6 h-6" />
                Your Stats
              </h2>
              <button onClick={() => setShowStats(false)} className="p-2 hover:bg-amber-100 rounded-lg transition-colors">
                <X className="w-6 h-6 text-amber-900" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="bg-amber-50 rounded-xl p-4 text-center">
                <div className="text-4xl font-bold text-amber-900">{userStats.totalDrinks}</div>
                <div className="text-amber-700 mt-1">Total Drinks (All Time)</div>
              </div>
              <div className="bg-amber-50 rounded-xl p-4 text-center">
                <div className="text-4xl font-bold text-amber-900">{userStats.sessionsParticipated}</div>
                <div className="text-amber-700 mt-1">Sessions Participated</div>
              </div>
              <div className="bg-amber-50 rounded-xl p-4 text-center">
                <div className="text-4xl font-bold text-amber-900">{userStats.averagePerSession}</div>
                <div className="text-amber-700 mt-1">Average per Session</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showAccountModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-amber-900">{accountMode === 'login' ? 'Login' : 'Create Account'}</h2>
              <button onClick={() => setShowAccountModal(false)} className="p-2 hover:bg-amber-100 rounded-lg transition-colors">
                <X className="w-6 h-6 text-amber-900" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-amber-900 text-sm block mb-2 font-medium">Username</label>
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter username..." className="w-full px-4 py-2 rounded-lg border-2 border-amber-200 focus:border-amber-500 focus:outline-none text-amber-900" />
              </div>
              {accountMode === 'create' && (
                <div>
                  <label className="text-amber-900 text-sm block mb-2 font-medium">Display Name</label>
                  <input type="text" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Enter display name..." className="w-full px-4 py-2 rounded-lg border-2 border-amber-200 focus:border-amber-500 focus:outline-none text-amber-900" />
                </div>
              )}
              <button onClick={accountMode === 'login' ? loginAccount : createAccount} className="w-full py-3 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors font-bold">
                {accountMode === 'login' ? 'Login' : 'Create Account'}
              </button>
              <button onClick={() => setAccountMode(accountMode === 'login' ? 'create' : 'login')} className="w-full text-amber-700 hover:text-amber-900 text-sm">
                {accountMode === 'login' ? "Don't have an account? Create one" : 'Already have an account? Login'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 max-w-4xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold text-amber-900 flex items-center gap-2">
                <History className="w-6 h-6" />
                Session History
              </h2>
              <button onClick={() => setShowHistory(false)} className="p-2 hover:bg-amber-100 rounded-lg transition-colors">
                <X className="w-6 h-6 text-amber-900" />
              </button>
            </div>
            {sessionHistory.length === 0 ? (
              <div className="text-center text-amber-700 py-12">No previous sessions found</div>
            ) : (
              <div className="space-y-4">
                {sessionHistory.map((histSession, idx) => {
                  const totalDrinks = histSession.people.reduce((sum, p) => sum + p.drinks, 0);
                  const date = new Date(histSession.archived_at);
                  
                  return (
                    <div key={idx} className="bg-amber-50 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="text-amber-900">
                          <div className="font-bold text-lg">{date.toLocaleDateString()} at {date.toLocaleTimeString()}</div>
                          <div className="text-sm text-amber-700">{histSession.people.length} people • {totalDrinks} drinks</div>
                        </div>
                        <button onClick={() => exportHistorySession(histSession)} className="flex items-center gap-2 px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors text-sm">
                          <Download className="w-4 h-4" />
                          Export
                        </button>
                      </div>
                      <div className="space-y-2">
                        {[...histSession.people].sort((a, b) => b.drinks - a.drinks).map((person, pIdx) => (
                          <div key={pIdx} className="flex items-center justify-between bg-white rounded-lg p-3">
                            <div className="text-amber-900">
                              <span className="font-medium">{person.name}</span>
                              {person.username && <span className="text-xs text-amber-600 ml-2">@{person.username}</span>}
                            </div>
                            <div className="text-amber-900 text-right">
                              <div className="font-bold">{person.drinks} drinks</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}