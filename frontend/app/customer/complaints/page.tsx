'use client';

import { complaintsApi, Complaint, ComplaintNote, feedbackApi, Feedback } from '@/lib/api';
import { useState, useEffect } from 'react';
import { ComplaintForm, FeedbackForm } from '@/components/common';

import { toast } from '@/lib/toast';

export default function CustomerComplaintsPage() {
  const [activeTab, setActiveTab] = useState<'complaints' | 'feedback'>('complaints');
  const [showComplaintForm, setShowComplaintForm] = useState(false);
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedComplaintForDetails, setSelectedComplaintForDetails] = useState<Complaint | null>(null);
  const [complaintNotes, setComplaintNotes] = useState<ComplaintNote[]>([]);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);

  // Get customer name from localStorage or context
  const customerName = typeof window !== 'undefined' ? (localStorage.getItem('customer_name') || localStorage.getItem('userName') || 'Customer') : 'Customer';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [complaintsRes, feedbackRes] = await Promise.all([
        complaintsApi.getAll(),
        feedbackApi.getAll(),
      ]);
      
      // Filter by customer name
      const myComplaints = complaintsRes.data.filter((c: Complaint) => 
        c.raised_by === customerName
      );
      const myFeedback = feedbackRes.data.filter((f: Feedback) => 
        f.feedback_by === customerName
      );
      
      setComplaints(myComplaints);
      setFeedback(myFeedback);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }).replace(',', '');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'resolved':
      case 'closed':
        return 'bg-green-100 text-green-800';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-yellow-100 text-yellow-800';
    }
  };

  const handleViewComplaintDetails = async (complaint: Complaint) => {
    setSelectedComplaintForDetails(complaint);
    setShowDetailsModal(true);
    
    // Load conversation history
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

  const handleCloseDetailsModal = () => {
    setShowDetailsModal(false);
    setSelectedComplaintForDetails(null);
    setComplaintNotes([]);
  };

  return (
    <div className="space-y-6">
      {/* Page Title */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-black">Support & Feedback</h1>
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-lg shadow-sm">
        {/* Action Buttons */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex gap-4">
            <button
              onClick={() => setShowComplaintForm(true)}
              className="flex-1 px-6 py-4 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors"
            >
              <div className="flex flex-col items-center gap-2">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>Submit a Complaint</span>
              </div>
            </button>
            <button
              onClick={() => setShowFeedbackForm(true)}
              className="flex-1 px-6 py-4 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors"
            >
              <div className="flex flex-col items-center gap-2">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Give Feedback</span>
              </div>
            </button>
          </div>
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
              My Complaints ({complaints.length})
            </button>
            <button
              onClick={() => setActiveTab('feedback')}
              className={`pb-4 px-1 font-semibold transition-colors ${
                activeTab === 'feedback'
                  ? 'text-red-600 border-b-2 border-red-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              My Feedback ({feedback.length})
            </button>
          </div>
        </div>

        {/* Content Section */}
        <div className="p-6 space-y-4">
          {loading ? (
            <div className="text-center py-8">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
              <p className="mt-2 text-gray-600">Loading...</p>
            </div>
          ) : activeTab === 'complaints' ? (
            complaints.length > 0 ? (
              <div className="space-y-4">
                {complaints.map((complaint) => (
                  <div key={complaint.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{complaint.title}</h3>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(complaint.status)}`}>
                        {complaint.status.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>
                    {complaint.booking_id && (
                      <p className="text-sm text-gray-600 mb-2">Booking ID: #{complaint.booking_id}</p>
                    )}
                    <p className="text-sm text-gray-700 mb-3 line-clamp-2">{complaint.description || 'No description provided'}</p>
                    <div className="flex justify-between items-center">
                      <div className="text-xs text-gray-500">
                        <span>Submitted on {formatDate(complaint.created_at)}</span>
                        {complaint.assigned_to_name && (
                          <span className="ml-2">• Assigned to: {complaint.assigned_to_name}</span>
                        )}
                      </div>
                      <button
                        onClick={() => handleViewComplaintDetails(complaint)}
                        className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p className="text-gray-600 text-lg mb-2">No complaints submitted yet</p>
                <p className="text-gray-500 text-sm">Click "Submit a Complaint" above to report any issues</p>
              </div>
            )
          ) : (
            feedback.length > 0 ? (
              <div className="space-y-4">
                {feedback.map((item) => (
                  <div key={item.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold text-gray-900">{item.rating}</span>
                        <svg className="w-6 h-6 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                      </div>
                      {item.booking_id && (
                        <span className="text-sm text-gray-600">Booking ID: #{item.booking_id}</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 mb-3">{item.description || 'No description provided'}</p>
                    <div className="text-xs text-gray-500">
                      Submitted on {formatDate(item.created_at)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <svg className="w-16 h-16 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
                <p className="text-gray-600 text-lg mb-2">No feedback submitted yet</p>
                <p className="text-gray-500 text-sm">Click "Give Feedback" above to share your experience</p>
              </div>
            )
          )}
        </div>
      </div>

      {/* Create Complaint Form */}
      {showComplaintForm && (
        <ComplaintForm
          onClose={() => setShowComplaintForm(false)}
          onSuccess={() => {
            setShowComplaintForm(false);
            toast.success('Your complaint has been submitted. We will get back to you soon.');
            fetchData();
          }}
          userName={customerName}
        />
      )}

      {/* Create Feedback Form */}
      {showFeedbackForm && (
        <FeedbackForm
          onClose={() => setShowFeedbackForm(false)}
          onSuccess={() => {
            setShowFeedbackForm(false);
            toast.success('Thank you for your feedback!');
            fetchData();
          }}
          userName={customerName}
        />
      )}

      {/* Complaint Details Modal with Conversation History */}
      {showDetailsModal && selectedComplaintForDetails && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h2 className="text-xl font-bold text-gray-800">Complaint Details</h2>
              <button
                onClick={handleCloseDetailsModal}
                className="text-red-600 hover:text-red-700 text-2xl font-bold transition-colors"
              >
                ×
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Complaint Information */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <h3 className="text-lg font-semibold text-gray-900">{selectedComplaintForDetails.title}</h3>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(selectedComplaintForDetails.status)}`}>
                    {selectedComplaintForDetails.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                {selectedComplaintForDetails.booking_id && (
                  <p className="text-sm text-gray-600">Booking ID: #{selectedComplaintForDetails.booking_id}</p>
                )}
                <p className="text-sm text-gray-600">Submitted on: {formatDate(selectedComplaintForDetails.created_at)}</p>
                {selectedComplaintForDetails.assigned_to_name && (
                  <p className="text-sm text-gray-600">Assigned to: {selectedComplaintForDetails.assigned_to_name}</p>
                )}
                <div className="border-t border-gray-200 pt-3 mt-3">
                  <p className="text-sm font-medium text-gray-700 mb-1">Your Original Complaint:</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{selectedComplaintForDetails.description || 'No description provided'}</p>
                </div>
              </div>

              {/* Conversation History / Activity Log */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Activity & Updates</h3>
                {loadingNotes ? (
                  <div className="text-center py-8">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    <p className="mt-2 text-sm text-gray-600">Loading activity...</p>
                  </div>
                ) : complaintNotes.length > 0 ? (
                  <div className="space-y-3">
                    {complaintNotes.map((note) => (
                      <div key={note.id} className="border-l-4 border-blue-500 bg-blue-50 rounded-r-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <span className="font-semibold text-gray-900">
                              {note.user_name}
                            </span>
                            <span className="text-xs text-gray-600 ml-2">
                              ({note.user_role === 'admin' ? 'Admin' : note.user_role === 'salesman' ? 'Support Team' : 'Customer'})
                            </span>
                          </div>
                          <span className="text-xs text-gray-500">{formatDate(note.created_at)}</span>
                        </div>
                        {note.note_type === 'status_change' && (
                          <div className="mb-2 px-2 py-1 bg-blue-100 rounded text-xs text-blue-800 font-medium">
                            Status changed: <span className="font-semibold">{note.old_status?.replace('_', ' ').toUpperCase()}</span> → <span className="font-semibold">{note.new_status?.replace('_', ' ').toUpperCase()}</span>
                          </div>
                        )}
                        {note.note_type === 'assignment' && (
                          <div className="mb-2 px-2 py-1 bg-purple-100 rounded text-xs text-purple-800 font-medium">
                            Complaint assigned to {note.content}
                          </div>
                        )}
                        {note.note_type === 'reopened' && (
                          <div className="mb-2 px-2 py-1 bg-orange-100 rounded text-xs text-orange-800 font-medium">
                            Complaint reopened
                          </div>
                        )}
                        <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 bg-gray-50 rounded-lg border border-gray-200">
                    <svg className="w-12 h-12 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-sm text-gray-600">No updates yet. Your complaint is being reviewed.</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end p-6 border-t border-gray-200">
              <button
                onClick={handleCloseDetailsModal}
                className="px-6 py-2.5 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

