'use client';

import { useState, useEffect } from 'react';
import { complaintsApi, Complaint, ComplaintNote } from '@/lib/complaintsApi';
import { feedbackApi, Feedback } from '@/lib/feedbackApi';
import { usersApi } from '@/lib/api';
import { ComplaintForm, FeedbackForm } from '@/components/common';
import { toast } from '@/lib/toast';

export default function ComplaintsPage() {
  const [activeTab, setActiveTab] = useState<'complaints' | 'feedback'>('complaints');
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedComplaint, setSelectedComplaint] = useState<any>(null);
  const [assignTo, setAssignTo] = useState<string>('');
  const [resolutionStatus, setResolutionStatus] = useState<string>('pending');
  const [showViewFeedbackModal, setShowViewFeedbackModal] = useState(false);
  const [selectedFeedback, setSelectedFeedback] = useState<any>(null);
  const [showComplaintForm, setShowComplaintForm] = useState(false);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [complaintNotes, setComplaintNotes] = useState<ComplaintNote[]>([]);
  const [newNote, setNewNote] = useState<string>('');
  const [loadingNotes, setLoadingNotes] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [complaintsRes, feedbackRes, usersRes] = await Promise.all([
        complaintsApi.getAll(),
        feedbackApi.getAll(),
        usersApi.getAll(),
      ]);
      setComplaints(complaintsRes.data);
      setFeedback(feedbackRes.data);
      setUsers(usersRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (column: string) => {
    if (sortColumn !== column) {
      return (
        <svg className="w-4 h-4 inline-block ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    if (sortDirection === 'asc') {
      return (
        <svg className="w-4 h-4 inline-block ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      );
    }
    return (
      <svg className="w-4 h-4 inline-block ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  const handleViewComplaint = async (complaint: any) => {
    setSelectedComplaint(complaint);
    setAssignTo(complaint.assigned_to?.toString() || '');
    setResolutionStatus(complaint.status || 'pending');
    setShowViewModal(true);
    
    // Load complaint notes/history
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
      
      console.log('Updating complaint:', {
        id: selectedComplaint.id,
        oldStatus,
        newStatus: resolutionStatus,
        statusChanged,
        note,
        assignTo,
      });
      
      const updateData: any = {
        status: resolutionStatus as any,
        assigned_to: assignTo ? parseInt(assignTo) : undefined,
        user_name: 'Admin',
        user_role: 'admin',
      };
      
      // Add note if provided or if status changed
      if (note) {
        updateData.note = note;
      } else if (statusChanged) {
        updateData.note = `Status changed from ${oldStatus} to ${resolutionStatus}`;
      }
      
      const response = await complaintsApi.update(selectedComplaint.id, updateData);
      
      console.log('Update response:', response.data);
      
      toast.success('Complaint updated successfully');
      
      // Reload complaint data
      await fetchData();
      
      // Reload the complaint details and notes
      if (selectedComplaint) {
        try {
          // Get updated complaint
          const updatedComplaintRes = await complaintsApi.getById(selectedComplaint.id);
          setSelectedComplaint(updatedComplaintRes.data);
          setResolutionStatus(updatedComplaintRes.data.status);
          setAssignTo(updatedComplaintRes.data.assigned_to?.toString() || '');
          
          // Reload notes
          const notesRes = await complaintsApi.getNotes(selectedComplaint.id);
          setComplaintNotes(notesRes.data);
        } catch (error) {
          console.error('Error reloading complaint data:', error);
        }
      }
      
      // Clear the note field
      setNewNote('');
    } catch (error: any) {
      console.error('Error updating complaint:', error);
      toast.error(error.response?.data?.error || 'Failed to update complaint');
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim() || !selectedComplaint) return;

    try {
      await complaintsApi.addNote(selectedComplaint.id, {
        user_name: 'Admin',
        user_role: 'admin',
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

  const handleViewFeedback = (feedback: any) => {
    setSelectedFeedback(feedback);
    setShowViewFeedbackModal(true);
  };

  const handleCloseFeedbackModal = () => {
    setShowViewFeedbackModal(false);
    setSelectedFeedback(null);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).replace(',', '');
  };

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-black">Complaints & Feedback:</h1>
        <button className="px-4 py-2 border-2 border-red-600 text-red-600 font-semibold rounded-lg hover:bg-red-50 transition-colors">
          Admin Panel
        </button>
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-lg shadow-sm">
        {/* Add Button */}
        <div className="flex justify-end items-center p-6 pb-4">
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
            <button
              onClick={() => setActiveTab('complaints')}
              className={`pb-4 px-1 font-semibold transition-colors ${
                activeTab === 'complaints'
                  ? 'text-red-600 border-b-2 border-red-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Complaints
            </button>
            <button
              onClick={() => setActiveTab('feedback')}
              className={`pb-4 px-1 font-semibold transition-colors ${
                activeTab === 'feedback'
                  ? 'text-red-600 border-b-2 border-red-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Feedback
            </button>
          </div>
        </div>

        {/* Table Container */}
        <div className="p-6">
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full">
              {/* Table Header */}
              <thead>
                <tr className="bg-red-100">
                  <th className="w-1 px-0 py-3"></th>
                  {activeTab === 'complaints' ? (
                    <>
                      <th
                        className="px-4 py-3 text-left text-black font-bold cursor-pointer hover:bg-red-200 transition-colors"
                        onClick={() => handleSort('raisedBy')}
                      >
                        Raised by
                        {getSortIcon('raisedBy')}
                      </th>
                      <th
                        className="px-4 py-3 text-left text-black font-bold cursor-pointer hover:bg-red-200 transition-colors"
                        onClick={() => handleSort('raisedOn')}
                      >
                        Raised on
                        {getSortIcon('raisedOn')}
                      </th>
                      <th
                        className="px-4 py-3 text-left text-black font-bold cursor-pointer hover:bg-red-200 transition-colors"
                        onClick={() => handleSort('title')}
                      >
                        Title
                        {getSortIcon('title')}
                      </th>
                      <th
                        className="px-4 py-3 text-left text-black font-bold cursor-pointer hover:bg-red-200 transition-colors"
                        onClick={() => handleSort('description')}
                      >
                        Description
                        {getSortIcon('description')}
                      </th>
                      <th className="px-4 py-3 text-left text-black font-bold">Action</th>
                    </>
                  ) : (
                    <>
                      <th
                        className="px-4 py-3 text-left text-black font-bold cursor-pointer hover:bg-red-200 transition-colors"
                        onClick={() => handleSort('feedbackBy')}
                      >
                        Feedback by
                        {getSortIcon('feedbackBy')}
                      </th>
                      <th
                        className="px-4 py-3 text-left text-black font-bold cursor-pointer hover:bg-red-200 transition-colors"
                        onClick={() => handleSort('date')}
                      >
                        Date
                        {getSortIcon('date')}
                      </th>
                      <th
                        className="px-4 py-3 text-left text-black font-bold cursor-pointer hover:bg-red-200 transition-colors"
                        onClick={() => handleSort('rating')}
                      >
                        Rating
                        {getSortIcon('rating')}
                      </th>
                      <th
                        className="px-4 py-3 text-left text-black font-bold cursor-pointer hover:bg-red-200 transition-colors"
                        onClick={() => handleSort('description')}
                      >
                        Description
                        {getSortIcon('description')}
                      </th>
                      <th className="px-4 py-3 text-left text-black font-bold">Action</th>
                    </>
                  )}
                </tr>
              </thead>

              {/* Table Body */}
              <tbody>
                {activeTab === 'complaints' && complaints.map((complaint, index) => (
                  <tr
                    key={complaint.id}
                    className="border-b border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    {/* Status Indicator Bar */}
                    <td className="w-1 p-0">
                      <div
                        className={`w-full h-full min-h-[60px] ${
                          complaint.status === 'resolved' ? 'bg-green-500' : 'bg-red-500'
                        }`}
                      ></div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-900">{complaint.raised_by}</td>
                    <td className="px-4 py-4 text-sm text-gray-900">{formatDate(complaint.created_at)}</td>
                    <td className="px-4 py-4 text-sm font-medium text-gray-900">{complaint.title}</td>
                    <td className="px-4 py-4 text-sm text-gray-600 max-w-md">
                      {complaint.description && complaint.description.length > 80
                        ? `${complaint.description.substring(0, 80)}...`
                        : complaint.description || 'N/A'}
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => handleViewComplaint(complaint)}
                        className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center hover:bg-red-700 transition-colors"
                        title="View Details"
                      >
                        <svg
                          className="w-5 h-5 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
                {activeTab === 'feedback' && feedback.map((item, index) => (
                  <tr
                    key={item.id}
                    className="border-b border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    {/* Status Indicator Bar */}
                    <td className="w-1 p-0">
                      <div className="w-full h-full min-h-[60px] bg-red-500"></div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-900">{item.feedback_by}</td>
                    <td className="px-4 py-4 text-sm text-gray-900">{formatDate(item.created_at)}</td>
                    <td className="px-4 py-4 text-sm text-gray-900">
                      <div className="flex items-center gap-1">
                        <span>{item.rating}</span>
                        <svg
                          className="w-5 h-5 text-yellow-500"
                          fill="currentColor"
                          viewBox="0 0 20 20"
                        >
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-600 max-w-md">
                      {item.description && item.description.length > 80
                        ? `${item.description.substring(0, 80)}...`
                        : item.description || 'N/A'}
                    </td>
                    <td className="px-4 py-4">
                      <button
                        onClick={() => handleViewFeedback(item)}
                        className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center hover:bg-red-700 transition-colors"
                        title="View Details"
                      >
                        <svg
                          className="w-5 h-5 text-white"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* View Complaint Modal */}
      {showViewModal && selectedComplaint && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-800">View Complaint</h2>
              <button
                onClick={handleCloseModal}
                className="text-red-600 hover:text-red-700 text-2xl font-bold transition-colors"
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Read-only Information */}
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
                
                <div className="border-t border-gray-200 pt-4 mt-4"></div>
                
                <div className="flex justify-between items-start">
                  <span className="text-sm font-medium text-gray-600">Title:</span>
                  <span className="text-sm font-semibold text-gray-900 text-right flex-1 ml-4">{selectedComplaint.title}</span>
                </div>
                <div className="flex justify-between items-start">
                  <span className="text-sm font-medium text-gray-600">Description:</span>
                  <span className="text-sm text-gray-700 text-right flex-1 ml-4 whitespace-pre-wrap">
                    {selectedComplaint.description || 'N/A'}
                  </span>
                </div>
              </div>

              {/* Conversation History */}
              {complaintNotes.length > 0 && (
                <div className="border-t border-gray-200 pt-4">
                  <h3 className="text-sm font-semibold text-gray-900 mb-3">Conversation History</h3>
                  <div className="space-y-2 max-h-60 overflow-y-auto border border-gray-200 rounded-lg p-3 bg-gray-50">
                    {loadingNotes ? (
                      <p className="text-sm text-gray-500">Loading history...</p>
                    ) : (
                      complaintNotes.map((note) => (
                        <div key={note.id} className="bg-white border border-gray-200 rounded p-3 text-sm">
                          <div className="flex justify-between items-start mb-1">
                            <span className="font-semibold text-gray-900">
                              {note.user_name} <span className="text-xs text-gray-500">({note.user_role})</span>
                            </span>
                            <span className="text-xs text-gray-500">{formatDate(note.created_at)}</span>
                          </div>
                          {note.note_type === 'status_change' && (
                            <p className="text-xs text-blue-600 mb-1">
                              Status changed: {note.old_status} → {note.new_status}
                            </p>
                          )}
                          <p className="text-gray-700 whitespace-pre-wrap">{note.content}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Add New Note */}
              <div className="border-t border-gray-200 pt-4">
                <label className="block text-sm font-semibold text-gray-900 mb-2">Add Note / Reopen</label>
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add a note, ask for clarification, or explain why reopening..."
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

              {/* Actionable Fields */}
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Assign to</label>
                  <div className="relative">
                    <select
                      value={assignTo}
                      onChange={(e) => setAssignTo(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white"
                    >
                      <option value="">Select User</option>
                      {users.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.name} ({user.role})
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <svg
                        className="w-5 h-5 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Resolution Status</label>
                  <div className="relative">
                    <select
                      value={resolutionStatus}
                      onChange={(e) => setResolutionStatus(e.target.value)}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-red-500 bg-white"
                    >
                      <option value="pending">Pending</option>
                      <option value="in_progress">In Progress</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <svg
                        className="w-5 h-5 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-4 p-6 border-t border-gray-200">
              <button
                onClick={handleCloseModal}
                className="px-6 py-2.5 bg-white border-2 border-red-600 text-red-600 font-semibold rounded-lg hover:bg-red-50 transition-colors"
              >
                CANCEL
              </button>
              <button
                onClick={handleSaveComplaint}
                className="px-6 py-2.5 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors"
              >
                SAVE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* View Feedback Modal */}
      {showViewFeedbackModal && selectedFeedback && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-800">View Feedback</h2>
              <button
                onClick={handleCloseFeedbackModal}
                className="text-red-600 hover:text-red-700 text-2xl font-bold transition-colors"
              >
                ×
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-4">
              {/* Feedback Information */}
              <div className="space-y-4">
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
                    <svg
                      className="w-5 h-5 text-yellow-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  </div>
                </div>
                <div className="flex justify-between items-start pt-2">
                  <span className="text-sm font-bold text-gray-800">Description:</span>
                  <span className="text-sm text-gray-700 text-right flex-1 ml-4 whitespace-pre-wrap">
                    {selectedFeedback.description || 'N/A'}
                  </span>
                </div>
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
          userName="Admin"
        />
      )}

      {/* Create Feedback Form */}
      {showFeedbackForm && (
        <FeedbackForm
          onClose={() => setShowFeedbackForm(false)}
          onSuccess={fetchData}
          userName="Admin"
        />
      )}
    </div>
  );
}
