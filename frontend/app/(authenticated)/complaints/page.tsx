'use client';

import { complaintsApi, Complaint, ComplaintNote, feedbackApi, Feedback, usersApi } from '@/lib/api';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/authContext';
import { ComplaintForm, FeedbackForm } from '@/components/common';
import { toast } from '@/lib/toast';

// ─── Multi-Select Dropdown ────────────────────────────────────────────────────
function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggle = (val: string) => {
    onChange(selected.includes(val) ? selected.filter(v => v !== val) : [...selected, val]);
  };

  const displayLabel =
    selected.length === 0 ? `All ${label}` : `${label} (${selected.length})`;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-colors ${
          selected.length > 0
            ? 'border-red-500 bg-red-50 text-red-700 font-medium'
            : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'
        }`}
      >
        <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
        </svg>
        {displayLabel}
        <svg className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-20 mt-1 left-0 bg-white border border-gray-200 rounded-lg shadow-lg min-w-[180px] py-1">
          {options.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-400">No options</p>
          ) : (
            <>
              <button
                onClick={() => onChange([])}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50 border-b border-gray-100"
              >
                Clear all
              </button>
              {options.map(opt => (
                <label key={opt} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.includes(opt)}
                    onChange={() => toggle(opt)}
                    className="accent-red-600 w-4 h-4 flex-shrink-0"
                  />
                  <span className="text-sm text-gray-700 capitalize">{opt.replace('_', ' ')}</span>
                </label>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    resolved:    'bg-green-100 text-green-700',
    in_progress: 'bg-blue-100 text-blue-700',
    closed:      'bg-gray-100 text-gray-600',
    pending:     'bg-yellow-100 text-yellow-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold capitalize ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status?.replace('_', ' ')}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ComplaintsPage() {
  const { isAdmin, user } = useAuth();
  const [activeTab, setActiveTab] = useState<'complaints' | 'feedback'>('complaints');

  // Sorting
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Search & filters
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRaisedBy, setFilterRaisedBy] = useState<string[]>([]);
  const [filterStatus, setFilterStatus] = useState<string[]>([]);

  // Modals
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState<any>(null);
  const [assignTo, setAssignTo] = useState<string>('');
  const [resolutionStatus, setResolutionStatus] = useState<string>('pending');
  const [showViewFeedbackModal, setShowViewFeedbackModal] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState<any>(null);
  const [showComplaintForm, setShowComplaintForm] = useState(false);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);

  // Data
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Notes
  const [complaintNotes, setComplaintNotes] = useState<ComplaintNote[]>([]);
  const [newNote, setNewNote] = useState<string>('');
  const [loadingNotes, setLoadingNotes] = useState(false);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [complaintsRes, feedbackRes] = await Promise.all([
        complaintsApi.getAll(),
        feedbackApi.getAll(),
      ]);
      setComplaints(complaintsRes.data);
      setFeedback(feedbackRes.data);
      if (isAdmin) {
        const usersRes = await usersApi.getAll();
        setUsers(usersRes.data || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  // Reset filters on tab switch
  const handleTabSwitch = (tab: 'complaints' | 'feedback') => {
    setActiveTab(tab);
    setSearchQuery('');
    setFilterRaisedBy([]);
    setFilterStatus([]);
    setSortColumn(null);
    setSortDirection('asc');
  };

  // ── Sorting ──────────────────────────────────────────────────────────────────
  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return (
        <svg className="w-4 h-4 inline-block ml-1 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    return sortDirection === 'asc' ? (
      <svg className="w-4 h-4 inline-block ml-1 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-4 h-4 inline-block ml-1 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  const getSortValue = (item: any, col: string): string | number => {
    switch (col) {
      case 'raisedBy':    return (item.raised_by || '').toLowerCase();
      case 'feedbackBy':  return (item.feedback_by || '').toLowerCase();
      case 'raisedOn':
      case 'date':        return new Date(item.created_at).getTime();
      case 'title':       return (item.title || '').toLowerCase();
      case 'description': return (item.description || '').toLowerCase();
      case 'status':      return (item.status || '').toLowerCase();
      case 'rating':      return item.rating ?? 0;
      default:            return '';
    }
  };

  const applySort = <T,>(data: T[]): T[] => {
    if (!sortColumn) return data;
    return [...data].sort((a, b) => {
      const va = getSortValue(a as any, sortColumn);
      const vb = getSortValue(b as any, sortColumn);
      if (va < vb) return sortDirection === 'asc' ? -1 : 1;
      if (va > vb) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  };

  // ── Derived data ─────────────────────────────────────────────────────────────
  const q = searchQuery.toLowerCase();

  const filteredComplaints = applySort(
    complaints.filter(c => {
      const matchSearch = !q ||
        (c.raised_by || '').toLowerCase().includes(q) ||
        (c.title || '').toLowerCase().includes(q) ||
        (c.description || '').toLowerCase().includes(q);
      const matchRaisedBy = filterRaisedBy.length === 0 || filterRaisedBy.includes(c.raised_by || '');
      const matchStatus   = filterStatus.length === 0   || filterStatus.includes(c.status || '');
      return matchSearch && matchRaisedBy && matchStatus;
    })
  );

  const filteredFeedback = applySort(
    feedback.filter(f => {
      const matchSearch = !q ||
        (f.feedback_by || '').toLowerCase().includes(q) ||
        (f.description || '').toLowerCase().includes(q);
      const matchRaisedBy = filterRaisedBy.length === 0 || filterRaisedBy.includes(f.feedback_by || '');
      return matchSearch && matchRaisedBy;
    })
  );

  // Unique options for filters
  const uniqueRaisedBy = activeTab === 'complaints'
    ? [...new Set(complaints.map(c => c.raised_by).filter(Boolean))] as string[]
    : [...new Set(feedback.map(f => f.feedback_by).filter(Boolean))] as string[];

  const statusOptions = ['pending', 'in_progress', 'resolved', 'closed'];

  // ── Complaint modal ───────────────────────────────────────────────────────────
  const handleViewComplaint = async (complaint: any) => {
    setSelectedComplaint(complaint);
    setAssignTo(complaint.assigned_to?.toString() || '');
    setResolutionStatus(complaint.status || 'pending');
    setShowViewModal(true);
    try {
      setLoadingNotes(true);
      const notesRes = await complaintsApi.getNotes(complaint.id);
      setComplaintNotes(notesRes.data);
    } catch (error) {
      console.error('Error loading complaint notes:', error);
    } finally {
      setLoadingNotes(false);
    }
  };

  const handleCloseModal = () => {
    setShowViewModal(false);
    setSelectedComplaint(null);
    setAssignTo('');
    setResolutionStatus('pending');
    setComplaintNotes([]);
    setNewNote('');
  };

  const handleSaveComplaint = async () => {
    try {
      const oldStatus = selectedComplaint.status;
      const statusChanged = resolutionStatus !== oldStatus;
      const note = newNote.trim();
      const updateData: any = {
        status: resolutionStatus as any,
        assigned_to: assignTo ? parseInt(assignTo) : undefined,
        user_name: user.name,
        user_role: user.role,
      };
      if (note) {
        updateData.note = note;
      } else if (statusChanged) {
        updateData.note = `Status changed from ${oldStatus} to ${resolutionStatus}`;
      }
      await complaintsApi.update(selectedComplaint.id, updateData);
      toast.success('Complaint updated successfully');
      handleCloseModal();
      await fetchData();
    } catch (error: any) {
      console.error('Error updating complaint:', error);
      toast.error(error.response?.data?.details || error.response?.data?.error || 'Failed to update complaint');
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || !selectedComplaint) return;
    try {
      await complaintsApi.addNote(selectedComplaint.id, {
        user_name: user.name,
        user_role: user.role,
        note_type: 'comment',
        content: newNote,
      });
      setNewNote('');
      const notesRes = await complaintsApi.getNotes(selectedComplaint.id);
      setComplaintNotes(notesRes.data);
      toast.success('Note added successfully');
    } catch (error) {
      console.error('Error adding note:', error);
      toast.error('Failed to add note');
    }
  };

  const handleViewFeedback = (fb: any) => {
    setSelectedFeedback(fb);
    setShowViewFeedbackModal(true);
  };

  const handleCloseFeedbackModal = () => {
    setShowViewFeedbackModal(false);
    setSelectedFeedback(null);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-GB', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    }).replace(',', '');
  };

  // ── Eye button shared SVG ─────────────────────────────────────────────────────
  const EyeButton = ({ onClick }: { onClick: () => void }) => (
    <button
      onClick={onClick}
      className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center hover:bg-red-700 transition-colors"
      title="View Details"
    >
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    </button>
  );

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold text-black">Complaints & Feedback</h1>

      <div className="bg-white rounded-lg shadow-sm">
        {/* Top bar: Add button */}
        <div className="flex justify-end items-center px-6 pt-6 pb-4">
          {activeTab === 'complaints' ? (
            <button
              onClick={() => setShowComplaintForm(true)}
              className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors"
            >
              + New Complaint
            </button>
          ) : (
            <button
              onClick={() => setShowFeedbackForm(true)}
              className="px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors"
            >
              + New Feedback
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="px-6 border-b border-gray-200">
          <div className="flex space-x-6">
            {(['complaints', 'feedback'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => handleTabSwitch(tab)}
                className={`pb-4 px-1 font-semibold capitalize transition-colors ${
                  activeTab === tab
                    ? 'text-red-600 border-b-2 border-red-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* Search + Filter bar */}
        <div className="px-6 py-4 flex flex-wrap items-center gap-3 border-b border-gray-100">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px]">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={
                activeTab === 'complaints'
                  ? 'Search by raised by, title, description…'
                  : 'Search by feedback by, description…'
              }
              className="w-full pl-9 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Raised By filter */}
          <MultiSelect
            label={activeTab === 'complaints' ? 'Raised By' : 'Feedback By'}
            options={uniqueRaisedBy}
            selected={filterRaisedBy}
            onChange={setFilterRaisedBy}
          />

          {/* Status filter — complaints only */}
          {activeTab === 'complaints' && (
            <MultiSelect
              label="Status"
              options={statusOptions}
              selected={filterStatus}
              onChange={setFilterStatus}
            />
          )}

          {/* Result count */}
          <span className="text-xs text-gray-400 ml-auto">
            {activeTab === 'complaints' ? filteredComplaints.length : filteredFeedback.length} result(s)
          </span>
        </div>

        {/* Table */}
        <div className="p-6">
          {loading ? (
            <p className="text-center text-gray-500 py-12">Loading…</p>
          ) : (
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <table className="w-full">
                <thead className="sticky top-0 z-10">
                  <tr className="bg-red-100">
                    <th className="w-1 px-0 py-3" />
                    {activeTab === 'complaints' ? (
                      <>
                        <th className="px-4 py-3 text-left text-black font-bold cursor-pointer hover:bg-red-200 transition-colors" onClick={() => handleSort('raisedBy')}>
                          Raised by {getSortIcon('raisedBy')}
                        </th>
                        <th className="px-4 py-3 text-left text-black font-bold cursor-pointer hover:bg-red-200 transition-colors" onClick={() => handleSort('raisedOn')}>
                          Raised on {getSortIcon('raisedOn')}
                        </th>
                        <th className="px-4 py-3 text-left text-black font-bold cursor-pointer hover:bg-red-200 transition-colors" onClick={() => handleSort('title')}>
                          Title {getSortIcon('title')}
                        </th>
                        <th className="px-4 py-3 text-left text-black font-bold cursor-pointer hover:bg-red-200 transition-colors" onClick={() => handleSort('description')}>
                          Description {getSortIcon('description')}
                        </th>
                        <th className="px-4 py-3 text-left text-black font-bold cursor-pointer hover:bg-red-200 transition-colors" onClick={() => handleSort('status')}>
                          Status {getSortIcon('status')}
                        </th>
                        <th className="px-4 py-3 text-left text-black font-bold">Action</th>
                      </>
                    ) : (
                      <>
                        <th className="px-4 py-3 text-left text-black font-bold cursor-pointer hover:bg-red-200 transition-colors" onClick={() => handleSort('feedbackBy')}>
                          Feedback by {getSortIcon('feedbackBy')}
                        </th>
                        <th className="px-4 py-3 text-left text-black font-bold cursor-pointer hover:bg-red-200 transition-colors" onClick={() => handleSort('date')}>
                          Date {getSortIcon('date')}
                        </th>
                        <th className="px-4 py-3 text-left text-black font-bold cursor-pointer hover:bg-red-200 transition-colors" onClick={() => handleSort('rating')}>
                          Rating {getSortIcon('rating')}
                        </th>
                        <th className="px-4 py-3 text-left text-black font-bold cursor-pointer hover:bg-red-200 transition-colors" onClick={() => handleSort('description')}>
                          Description {getSortIcon('description')}
                        </th>
                        <th className="px-4 py-3 text-left text-black font-bold">Action</th>
                      </>
                    )}
                  </tr>
                </thead>

                <tbody>
                  {activeTab === 'complaints' && (
                    filteredComplaints.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-gray-400">No complaints match your search or filters.</td>
                      </tr>
                    ) : filteredComplaints.map((complaint: any) => (
                      <tr key={complaint.id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                        <td className="w-1 p-0">
                          <div className={`w-full h-full min-h-[60px] ${complaint.status === 'resolved' ? 'bg-green-500' : complaint.status === 'in_progress' ? 'bg-blue-500' : complaint.status === 'closed' ? 'bg-gray-400' : 'bg-red-500'}`} />
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-900">{complaint.raised_by}</td>
                        <td className="px-4 py-4 text-sm text-gray-900 whitespace-nowrap">{formatDate(complaint.created_at)}</td>
                        <td className="px-4 py-4 text-sm font-medium text-gray-900">{complaint.title}</td>
                        <td className="px-4 py-4 text-sm text-gray-600 max-w-xs">
                          {complaint.description && complaint.description.length > 80
                            ? `${complaint.description.substring(0, 80)}…`
                            : complaint.description || '—'}
                        </td>
                        <td className="px-4 py-4">
                          <StatusBadge status={complaint.status} />
                        </td>
                        <td className="px-4 py-4">
                          <EyeButton onClick={() => handleViewComplaint(complaint)} />
                        </td>
                      </tr>
                    ))
                  )}

                  {activeTab === 'feedback' && (
                    filteredFeedback.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-gray-400">No feedback matches your search or filters.</td>
                      </tr>
                    ) : filteredFeedback.map((item: any) => (
                      <tr key={item.id} className="border-b border-gray-200 hover:bg-gray-50 transition-colors">
                        <td className="w-1 p-0">
                          <div className="w-full h-full min-h-[60px] bg-red-500" />
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-900">{item.feedback_by}</td>
                        <td className="px-4 py-4 text-sm text-gray-900 whitespace-nowrap">{formatDate(item.created_at)}</td>
                        <td className="px-4 py-4 text-sm text-gray-900">
                          <div className="flex items-center gap-1">
                            <span>{item.rating}</span>
                            <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600 max-w-xs">
                          {item.description && item.description.length > 80
                            ? `${item.description.substring(0, 80)}…`
                            : item.description || '—'}
                        </td>
                        <td className="px-4 py-4">
                          <EyeButton onClick={() => handleViewFeedback(item)} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* View Complaint Modal */}
      {showViewModal && selectedComplaint && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
            <div className="flex-shrink-0 bg-white flex justify-between items-center px-6 py-4 border-b border-gray-200 rounded-t-lg">
              <h2 className="text-xl font-bold text-gray-800">View Complaint</h2>
              <div className="flex items-center gap-3">
                <StatusBadge status={selectedComplaint.status} />
                <button onClick={handleCloseModal} className="text-red-600 hover:text-red-700 text-2xl font-bold transition-colors">×</button>
              </div>
            </div>

            <div className="overflow-y-auto flex-1 p-6 space-y-6">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-600">Raised by:</span>
                  <span className="text-sm font-semibold text-gray-900">{selectedComplaint.raised_by}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-600">Raised on:</span>
                  <span className="text-sm font-semibold text-gray-900">{formatDate(selectedComplaint.created_at)}</span>
                </div>
                {selectedComplaint.booking_id && (
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-600">Booking ID:</span>
                    <span className="text-sm font-semibold text-gray-900">{selectedComplaint.booking_id}</span>
                  </div>
                )}
                <div className="border-t border-gray-200 pt-4 mt-4" />
                <div className="flex justify-between items-start">
                  <span className="text-sm font-medium text-gray-600">Title:</span>
                  <span className="text-sm font-semibold text-gray-900 text-right flex-1 ml-4">{selectedComplaint.title}</span>
                </div>
                <div className="flex justify-between items-start">
                  <span className="text-sm font-medium text-gray-600">Description:</span>
                  <span className="text-sm text-gray-700 text-right flex-1 ml-4 whitespace-pre-wrap">{selectedComplaint.description || '—'}</span>
                </div>
              </div>

              {complaintNotes.length > 0 && (
                <div className="border-t border-gray-200 pt-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Conversation History</h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-gray-50">
                    {loadingNotes ? (
                      <p className="text-sm text-gray-500">Loading history…</p>
                    ) : (
                      complaintNotes.map(note => (
                        <div key={note.id} className="bg-white border border-gray-200 rounded p-3 text-sm">
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-semibold text-gray-900">{note.user_name} <span className="text-xs text-gray-500">({note.user_role})</span></span>
                            <span className="text-xs text-gray-500">{formatDate(note.created_at)}</span>
                          </div>
                          {note.note_type === 'status_change' && (
                            <p className="text-xs text-blue-600 mb-1">Status changed: {note.old_status} → {note.new_status}</p>
                          )}
                          <p className="text-gray-700 whitespace-pre-wrap">{note.content}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              <div className="border-t border-gray-200 pt-4">
                <label className="block text-sm font-semibold text-gray-900 mb-2">Add Note / Reopen</label>
                <textarea
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  placeholder="Add a note, ask for clarification, or explain why reopening…"
                  rows={3}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 mb-2"
                />
                <button
                  onClick={handleAddNote}
                  disabled={!newNote.trim()}
                  className="px-4 py-2 bg-gray-600 text-white text-sm font-semibold rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add Note
                </button>
              </div>

              {isAdmin && (
                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Assign to</label>
                    <select value={assignTo} onChange={e => setAssignTo(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white">
                      <option value="">Select User</option>
                      {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Resolution Status</label>
                    <select value={resolutionStatus} onChange={e => setResolutionStatus(e.target.value)} className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white">
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="flex-shrink-0 flex justify-end gap-4 px-6 py-4 border-t border-gray-200 rounded-b-lg">
              <button onClick={handleCloseModal} className="px-6 py-2.5 bg-white border-2 border-red-600 text-red-600 font-semibold rounded-lg hover:bg-red-50 transition-colors">
                {isAdmin ? 'CANCEL' : 'CLOSE'}
              </button>
              {isAdmin && (
                <button onClick={handleSaveComplaint} className="px-6 py-2.5 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors">
                  SAVE
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* View Feedback Modal */}
      {showViewFeedbackModal && selectedFeedback && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-800">View Feedback</h2>
              <button onClick={handleCloseFeedbackModal} className="text-red-600 hover:text-red-700 text-2xl font-bold transition-colors">×</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-600">Feedback by:</span>
                <span className="text-sm font-semibold text-gray-900">{selectedFeedback.feedback_by}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-600">Date:</span>
                <span className="text-sm font-semibold text-gray-900">{formatDate(selectedFeedback.created_at)}</span>
              </div>
              {selectedFeedback.booking_id && (
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-600">Booking ID:</span>
                  <span className="text-sm font-semibold text-gray-900">{selectedFeedback.booking_id}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-gray-600">Rating:</span>
                <div className="flex items-center gap-1">
                  <span className="text-sm font-semibold text-gray-900">{selectedFeedback.rating}</span>
                  <svg className="w-5 h-5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                </div>
              </div>
              <div className="flex justify-between items-start pt-2">
                <span className="text-sm font-bold text-gray-800">Description:</span>
                <span className="text-sm text-gray-700 text-right flex-1 ml-4 whitespace-pre-wrap">{selectedFeedback.description || '—'}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Complaint Form */}
      {showComplaintForm && (
        <ComplaintForm
          onClose={() => setShowComplaintForm(false)}
          onSuccess={fetchData}
          userName={user.name}
        />
      )}

      {/* Create Feedback Form */}
      {showFeedbackForm && (
        <FeedbackForm
          onClose={() => setShowFeedbackForm(false)}
          onSuccess={fetchData}
          userName={user.name}
        />
      )}
    </div>
  );
}
