import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from './lib/supabaseClient.js';
import {
  Search, PlusCircle, Filter, Tag, MapPin, Calendar, User, ShieldCheck,
  MessageSquare, CheckCircle, Clock, AlertTriangle, Trash2, Pin, Flag,
  Send, X, Sparkles, Image as ImageIcon, ChevronRight, BarChart2, Check, Pencil, XCircle,
  Mail, Phone, Info, Award, Layers, Bell, LogOut, ArrowRight, RefreshCw
} from 'lucide-react';

const INITIAL_ITEMS = [];

const CATEGORIES = [
  'All Categories',
  'Electronics',
  'Clothing & Apparel',
  'Books & Supplies',
  'Keys & IDs',
  'Bags & Luggage',
  'Accessories',
  'Sports Equipment',
  'Other'
];

function getReportTrackingStatus(item) {
  if (item.cancelledAt) {
    return {
      label: 'Cancelled',
      description: 'You cancelled this report.',
      classes: 'bg-rose-50 text-rose-700 border-rose-200',
    };
  }

  if (item.approvalStatus !== 'Approved') {
    return {
      label: 'Pending',
      description: 'Waiting for an administrator to review this report.',
      classes: 'bg-amber-50 text-amber-700 border-amber-200',
    };
  }

  if (item.status === 'Claimed') {
    return {
      label: 'Claimed',
      description: 'Someone has reported a claim for this item.',
      classes: 'bg-sky-50 text-sky-700 border-sky-200',
    };
  }

  if (item.status === 'Resolved') {
    return {
      label: 'Resolved',
      description: 'This report has been marked as resolved.',
      classes: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    };
  }

  return {
    label: 'Approved',
    description: 'Approved and visible in Browse Items.',
    classes: 'bg-green-50 text-green-700 border-green-200',
  };
}

export default function App({ user, onSignOut }) {
  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Student';
  const avatarInitial = displayName.trim().charAt(0).toUpperCase() || 'S';
  // Main State
  const [items, setItems] = useState(INITIAL_ITEMS);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [isSubmittingPost, setIsSubmittingPost] = useState(false);
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [currentUserRole, setCurrentUserRole] = useState('student');
  const [activeTab, setActiveTab] = useState('browse'); // 'browse' | 'admin-panel' | 'my-posts'

  // Check the signed-in user's role using the admin_users table.
  // The table's RLS policy should allow each authenticated user to read only their own row.
  useEffect(() => {
    let isActive = true;

    async function checkUserRole() {
      if (!user?.id) {
        if (isActive) {
          setCurrentUserRole('student');
          setActiveTab('browse');
        }
        return;
      }

      const { data, error } = await supabase
        .from('admin_users')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!isActive) return;

      if (error) {
        console.error('Could not check admin role:', error.message);
        setCurrentUserRole('student');
        setActiveTab('browse');
        return;
      }

      if (data) {
        setCurrentUserRole('admin');
        console.log('Signed in as admin.');
      } else {
        setCurrentUserRole('student');
        setActiveTab('browse');
        console.log('Signed in as student.');
      }
    }

    checkUserRole();

    return () => {
      isActive = false;
    };
  }, [user?.id]);
  
  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all'); // 'all' | 'lost' | 'found'
  const [selectedCategory, setSelectedCategory] = useState('All Categories');
  const [selectedStatus, setSelectedStatus] = useState('all'); // 'all' | 'Active' | 'Resolved'
  const [sortBy, setSortBy] = useState('newest'); // 'newest' | 'oldest'

  // Modals & Panels State
  const [isPostModalOpen, setIsPostModalOpen] = useState(false);
  const [activeItemForContact, setActiveItemForContact] = useState(null);
  const [activeItemForDetail, setActiveItemForDetail] = useState(null);
  const [itemBeingEdited, setItemBeingEdited] = useState(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editForm, setEditForm] = useState({
    type: 'lost',
    title: '',
    category: 'Electronics',
    location: '',
    date: '',
    description: '',
    contactName: '',
  });

  // New Item Form State
  const [newItem, setNewItem] = useState({
    type: 'lost',
    title: '',
    category: 'Electronics',
    location: '',
    date: new Date().toISOString().split('T')[0],
    description: '',
    contactName: displayName,
    image: '',
  });

  // Direct Message / Claim State
  const [messages] = useState([]);
  const [newMessageText, setNewMessageText] = useState('');
  const [claimNote, setClaimNote] = useState('');
  const [isClaiming, setIsClaiming] = useState(false);

  // Toast Notification System
  const [toast, setToast] = useState(null);
  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Persistent in-app notifications from Supabase.
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(true);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const unreadNotificationCount = notifications.filter(notification => !notification.is_read).length;

  useEffect(() => {
    if (!user?.id) {
      setNotifications([]);
      setNotificationsLoading(false);
      return;
    }

    let active = true;

    const channel = supabase
      .channel(`user-notifications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `recipient_id=eq.${user.id}`,
        },
        (payload) => {
          if (!active || !payload.new) return;
          setNotifications(previous => {
            if (previous.some(notification => notification.id === payload.new.id)) {
              return previous;
            }
            return [payload.new, ...previous].slice(0, 50);
          });
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Live notifications are unavailable. Refresh the page to load the latest notifications.');
        }
      });

    async function loadNotifications() {
      setNotificationsLoading(true);
      const { data, error } = await supabase
        .from('notifications')
        .select('id, recipient_id, report_id, report_title, title, message, event_type, is_read, created_at')
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (!active) return;

      if (error) {
        console.error('Could not load notifications:', error.message);
        setNotifications([]);
      } else {
        setNotifications(data || []);
      }
      setNotificationsLoading(false);
    }

    loadNotifications();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const handleMarkNotificationRead = async (notificationId) => {
    const notification = notifications.find(item => item.id === notificationId);
    if (!notification || notification.is_read) return;

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('recipient_id', user.id);

    if (error) {
      showToast(error.message || 'Could not mark notification as read.', 'error');
      return;
    }

    setNotifications(previous => previous.map(item =>
      item.id === notificationId ? { ...item, is_read: true } : item
    ));
  };

  const handleMarkAllNotificationsRead = async () => {
    if (unreadNotificationCount === 0) return;

    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('recipient_id', user.id)
      .eq('is_read', false);

    if (error) {
      showToast(error.message || 'Could not mark notifications as read.', 'error');
      return;
    }

    setNotifications(previous => previous.map(item => ({ ...item, is_read: true })));
    showToast('All notifications marked as read.', 'success');
  };

  const handleDeleteNotification = async (notificationId) => {
    const notification = notifications.find(item => item.id === notificationId);
    if (!notification) return;

    const confirmed = window.confirm('Delete this notification? This action cannot be undone.');
    if (!confirmed) return;

    const { error } = await supabase
      .from('notifications')
      .delete()
      .eq('id', notificationId)
      .eq('recipient_id', user.id);

    if (error) {
      showToast(error.message || 'Could not delete notification.', 'error');
      return;
    }

    setNotifications(previous => previous.filter(item => item.id !== notificationId));
    showToast('Notification deleted.', 'success');
  };

  const handleOpenNotification = async (notification) => {
    await handleMarkNotificationRead(notification.id);
    setIsNotificationsOpen(false);
    setActiveTab('my-posts');
  };

  // Load real reports from Supabase. Photos are stored in a private bucket,
  // so each page load creates short-lived signed URLs for authenticated users.
  useEffect(() => {
    let cancelled = false;

    async function loadReports() {
      setItemsLoading(true);
      try {
        const { data, error } = await supabase
          .from('lost_found_items')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;

        const mappedItems = await Promise.all((data || []).map(async (row) => {
          let imageUrl = '';
          if (row.image_path) {
            const { data: signedData, error: signedError } = await supabase
              .storage
              .from('item-photos')
              .createSignedUrl(row.image_path, 60 * 60 * 12);

            if (signedError) {
              console.error('Could not create image URL:', signedError.message);
            } else {
              imageUrl = signedData?.signedUrl || '';
            }
          }

          return {
            id: row.id,
            type: row.type,
            title: row.title,
            category: row.category,
            location: row.location,
            date: row.item_date,
            description: row.description,
            contactName: row.contact_name,
            image: imageUrl,
            imagePath: row.image_path,
            status: row.status,
            approvalStatus: row.approval_status || 'Pending',
            cancelledAt: row.cancelled_at || null,
            pinned: false,
            flagged: false,
            createdById: row.created_by,
            createdAt: row.created_at,
          };
        }));

        if (!cancelled) setItems(mappedItems);
      } catch (error) {
        console.error('Could not load reports:', error);
        if (!cancelled) showToast(error.message || 'Could not load reports from the database.', 'error');
      } finally {
        if (!cancelled) setItemsLoading(false);
      }
    }

    loadReports();
    return () => { cancelled = true; };
  }, [user?.id]);

  // --- FILTER & SORT LOGIC ---
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Students can browse only approved reports. They can still see their own
      // pending reports under My Reported Items. Admins can see every report.
      if (activeTab === 'browse' && currentUserRole !== 'admin' &&
          (item.approvalStatus !== 'Approved' || item.cancelledAt)) {
        return false;
      }

      // Role-specific filtering tab view
      if (activeTab === 'my-posts' && item.createdById !== user?.id) {
        return false;
      }

      // Type filter (Lost vs Found)
      if (selectedType !== 'all' && item.type !== selectedType) return false;

      // Category filter
      if (selectedCategory !== 'All Categories' && item.category !== selectedCategory) return false;

      // Status filter
      if (selectedStatus !== 'all' && item.status !== selectedStatus) return false;

      // Search Query
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(query);
        const matchesLoc = item.location.toLowerCase().includes(query);
        const matchesDesc = item.description.toLowerCase().includes(query);
        const matchesCat = item.category.toLowerCase().includes(query);
        return matchesTitle || matchesLoc || matchesDesc || matchesCat;
      }

      return true;
    }).sort((a, b) => {
      // Pinned items stay on top in browse mode
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;

      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return sortBy === 'newest' ? dateB - dateA : dateA - dateB;
    });
  }, [items, selectedType, selectedCategory, selectedStatus, searchQuery, sortBy, activeTab, user?.id, currentUserRole]);

  // Dynamic Statistics for Header / Admin
  const stats = useMemo(() => {
    const reportableItems = items.filter(item => !item.cancelledAt);
    const total = reportableItems.length;
    const lost = reportableItems.filter(i => i.type === 'lost').length;
    const found = reportableItems.filter(i => i.type === 'found').length;
    const resolved = reportableItems.filter(i => i.status === 'Resolved' || i.status === 'Claimed').length;
    const rate = total > 0 ? Math.round((resolved / total) * 100) : 0;
    return { total, lost, found, resolved, rate };
  }, [items]);

  const topLostLocations = useMemo(() => {
    const counts = items
      .filter(item => item.type === 'lost' && !item.cancelledAt)
      .reduce((result, item) => {
        result[item.location] = (result[item.location] || 0) + 1;
        return result;
      }, {});
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  }, [items]);

  // --- HANDLERS ---
  const handleCreatePost = async (e) => {
    e.preventDefault();
    if (!newItem.title.trim() || !newItem.location.trim() || !newItem.description.trim() ||
        !newItem.contactName.trim() || !selectedImageFile) {
      showToast('Please complete the required fields and choose an item photo.', 'error');
      return;
    }

    if (!user?.id) {
      showToast('Please log in again before creating a report.', 'error');
      return;
    }

    setIsSubmittingPost(true);
    let uploadedPath = null;

    try {
      const safeFileName = selectedImageFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      uploadedPath = `${user.id}/${crypto.randomUUID()}-${safeFileName}`;

      const { error: uploadError } = await supabase
        .storage
        .from('item-photos')
        .upload(uploadedPath, selectedImageFile, {
          cacheControl: '3600',
          upsert: false,
          contentType: selectedImageFile.type,
        });

      if (uploadError) throw uploadError;

      const { data: insertedRow, error: insertError } = await supabase
        .from('lost_found_items')
        .insert({
          created_by: user.id,
          type: newItem.type,
          title: newItem.title.trim(),
          category: newItem.category,
          location: newItem.location.trim(),
          item_date: newItem.date,
          description: newItem.description.trim(),
          contact_name: newItem.contactName.trim(),
          image_path: uploadedPath,
          approval_status: currentUserRole === 'admin' ? 'Approved' : 'Pending',
        })
        .select()
        .single();

      if (insertError) throw insertError;

      const { data: signedData, error: signedError } = await supabase
        .storage
        .from('item-photos')
        .createSignedUrl(uploadedPath, 60 * 60 * 12);

      if (signedError) console.error('Photo uploaded, but signed URL could not be created:', signedError.message);

      const created = {
        id: insertedRow.id,
        type: insertedRow.type,
        title: insertedRow.title,
        category: insertedRow.category,
        location: insertedRow.location,
        date: insertedRow.item_date,
        description: insertedRow.description,
        contactName: insertedRow.contact_name,
        image: signedData?.signedUrl || '',
        imagePath: insertedRow.image_path,
        status: insertedRow.status,
        approvalStatus: insertedRow.approval_status || (currentUserRole === 'admin' ? 'Approved' : 'Pending'),
        cancelledAt: insertedRow.cancelled_at || null,
        pinned: false,
        flagged: false,
        createdById: insertedRow.created_by,
        createdAt: insertedRow.created_at,
      };

      setItems(previous => [created, ...previous]);
      setIsPostModalOpen(false);
      showToast(
        currentUserRole === 'admin'
          ? `Successfully published your ${newItem.type.toUpperCase()} report.`
          : `Your ${newItem.type.toUpperCase()} report was submitted and is waiting for admin approval.`,
        'success'
      );

      setNewItem({
        type: 'lost',
        title: '',
        category: 'Electronics',
        location: '',
        date: new Date().toISOString().split('T')[0],
        description: '',
        contactName: displayName,
        image: '',
      });
      setSelectedImageFile(null);
    } catch (error) {
      console.error('Could not publish report:', error);
      if (uploadedPath) {
        await supabase.storage.from('item-photos').remove([uploadedPath]);
      }
      showToast(error.message || 'Could not publish report. Please try again.', 'error');
    } finally {
      setIsSubmittingPost(false);
    }
  };

  const handleStatusChange = async (id, newStatus) => {
    if (currentUserRole !== 'admin') {
      showToast('Only an administrator can change report status.', 'error');
      return;
    }

    const { error } = await supabase
      .from('lost_found_items')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) {
      showToast(error.message || 'Could not update item status.', 'error');
      return;
    }

    setItems(previous => previous.map(item => item.id === id ? { ...item, status: newStatus } : item));
    showToast(`Item status updated to ${newStatus}`, 'success');
  };

  // Approve a student's report so it appears in the public Browse Items feed.
  const handleApproveItem = async (id) => {
    if (currentUserRole !== 'admin') {
      showToast('Only an administrator can approve reports.', 'error');
      return;
    }
    const itemToApprove = items.find(item => item.id === id);
    if (itemToApprove?.cancelledAt) {
      showToast('A cancelled report cannot be approved.', 'error');
      return;
    }

    const { error } = await supabase
      .from('lost_found_items')
      .update({ approval_status: 'Approved' })
      .eq('id', id);

    if (error) {
      showToast(error.message || 'Could not approve this report.', 'error');
      return;
    }

    setItems(previous => previous.map(item =>
      item.id === id ? { ...item, approvalStatus: 'Approved' } : item
    ));
    showToast('Report approved. Students can now see it in Browse Items.', 'success');
  };

  // Admins can edit any active report; students can edit only their own active reports.
  const openEditModal = (item) => {
    const isOwner = item.createdById === user?.id;
    if (item.cancelledAt) {
      showToast('Cancelled reports can no longer be edited.', 'error');
      return;
    }
    if (currentUserRole !== 'admin' && item.status !== 'Active') {
      showToast('Only active reports can be edited.', 'error');
      return;
    }
    if (currentUserRole !== 'admin' && !isOwner) {
      showToast('You can only edit your own report.', 'error');
      return;
    }

    setItemBeingEdited(item);
    setEditForm({
      type: item.type || 'lost',
      title: item.title || '',
      category: item.category || 'Other',
      location: item.location || '',
      date: item.date || '',
      description: item.description || '',
      contactName: item.contactName || '',
    });
  };

  const handleSaveEdit = async (event) => {
    event.preventDefault();

    const canEdit = itemBeingEdited && (
      currentUserRole === 'admin' || itemBeingEdited.createdById === user?.id
    );
    if (!canEdit || itemBeingEdited.cancelledAt) {
      showToast('You can only edit your own active report.', 'error');
      return;
    }

    if (!editForm.title.trim() || !editForm.location.trim() ||
        !editForm.description.trim() || !editForm.contactName.trim() || !editForm.date) {
      showToast('Please complete all required report fields.', 'error');
      return;
    }

    setIsSavingEdit(true);
    try {
      const updates = {
        type: editForm.type,
        title: editForm.title.trim(),
        category: editForm.category,
        location: editForm.location.trim(),
        item_date: editForm.date,
        description: editForm.description.trim(),
        contact_name: editForm.contactName.trim(),
      };

      const { data: updatedRow, error } = await supabase
        .from('lost_found_items')
        .update(updates)
        .eq('id', itemBeingEdited.id)
        .select()
        .single();

      if (error) throw error;

      const updatedItem = {
        ...itemBeingEdited,
        type: updatedRow.type,
        title: updatedRow.title,
        category: updatedRow.category,
        location: updatedRow.location,
        date: updatedRow.item_date,
        description: updatedRow.description,
        contactName: updatedRow.contact_name,
        status: updatedRow.status,
        approvalStatus: updatedRow.approval_status || itemBeingEdited.approvalStatus,
        cancelledAt: updatedRow.cancelled_at || null,
      };

      setItems(previous => previous.map(item =>
        item.id === itemBeingEdited.id ? { ...item, ...updatedItem } : item
      ));

      if (activeItemForDetail?.id === itemBeingEdited.id) {
        setActiveItemForDetail(updatedItem);
      }

      setItemBeingEdited(null);
      showToast(
        currentUserRole !== 'admin' && itemBeingEdited.approvalStatus === 'Approved'
          ? 'Report updated. It is Pending again and needs admin approval.'
          : 'Report details updated successfully.',
        'success'
      );
    } catch (error) {
      console.error('Could not update report:', error);
      showToast(error.message || 'Could not update this report. Check the admin database permissions.', 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Students can cancel only their own reports. Cancellation keeps the record
  // for history but hides it from other students' Browse Items feed.
  const handleCancelOwnReport = async (id) => {
    const itemToCancel = items.find(item => item.id === id);
    if (!itemToCancel || itemToCancel.createdById !== user?.id || currentUserRole === 'admin') {
      showToast('You can only cancel your own report as a student.', 'error');
      return;
    }
    if (itemToCancel.cancelledAt) {
      showToast('This report has already been cancelled.', 'info');
      return;
    }
    if (itemToCancel.status !== 'Active') {
      showToast('Only active reports can be cancelled. Contact an administrator if you need help.', 'error');
      return;
    }

    const shouldCancel = window.confirm(
      `Cancel the report \"${itemToCancel.title}\"? It will be hidden from other students, but remain in My Reported Items.`
    );
    if (!shouldCancel) return;

    const cancelledAt = new Date().toISOString();
    const { data, error } = await supabase
      .from('lost_found_items')
      .update({ cancelled_at: cancelledAt })
      .eq('id', id)
      .eq('created_by', user.id)
      .is('cancelled_at', null)
      .select('id, cancelled_at')
      .single();

    if (error) {
      showToast(error.message || 'Could not cancel this report.', 'error');
      return;
    }

    const updatedItem = { ...itemToCancel, cancelledAt: data.cancelled_at };
    setItems(previous => previous.map(item => item.id === id ? updatedItem : item));
    if (activeItemForDetail?.id === id) setActiveItemForDetail(updatedItem);
    showToast('Your report has been cancelled. It is still available in My Reported Items.', 'success');
  };

  const handleTogglePin = (id) => {
    setItems(items.map(item => item.id === id ? { ...item, pinned: !item.pinned } : item));
    showToast('Post pin status updated', 'info');
  };

  const handleToggleFlag = (id) => {
    setItems(items.map(item => item.id === id ? { ...item, flagged: !item.flagged } : item));
    showToast('Post flag status toggled for moderation', 'warning');
  };

  const handleDeleteItem = async (id) => {
    if (currentUserRole !== 'admin') {
      showToast('Only an administrator can delete reports.', 'error');
      return;
    }

    const itemToDelete = items.find(item => item.id === id);
    if (!itemToDelete) return;

    const shouldDelete = window.confirm(`Delete the report "${itemToDelete.title}"? This action cannot be undone.`);
    if (!shouldDelete) return;

    const { error } = await supabase
      .from('lost_found_items')
      .delete()
      .eq('id', id);

    if (error) {
      showToast(error.message || 'Could not delete this report. Check the admin database permissions.', 'error');
      return;
    }

    let photoCleanupFailed = false;
    if (itemToDelete.imagePath) {
      const { error: storageError } = await supabase
        .storage
        .from('item-photos')
        .remove([itemToDelete.imagePath]);
      if (storageError) {
        photoCleanupFailed = true;
        console.error('Photo cleanup failed:', storageError.message);
      }
    }

    setItems(previous => previous.filter(item => item.id !== id));
    if (activeItemForDetail?.id === id) setActiveItemForDetail(null);
    if (itemBeingEdited?.id === id) setItemBeingEdited(null);
    showToast(
      photoCleanupFailed
        ? 'Report deleted, but its stored photo could not be removed. Check Storage permissions.'
        : 'Report deleted successfully.',
      photoCleanupFailed ? 'warning' : 'success'
    );
  };

  const handleSendMessage = () => {
    showToast('Private messaging is not connected yet. We will add it in the next step.', 'info');
  };

  const handleCustomImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      showToast('Please choose a JPG, PNG, or WebP image.', 'error');
      e.target.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('Please choose an image smaller than 5 MB.', 'error');
      e.target.value = '';
      return;
    }

    setSelectedImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setNewItem(previous => ({ ...previous, image: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col">
      {/* --- TOAST ALERT --- */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-xl border text-sm font-medium transition-all transform animate-bounce ${
          toast.type === 'success' ? 'bg-emerald-900 text-emerald-100 border-emerald-700' :
          toast.type === 'error' ? 'bg-rose-900 text-rose-100 border-rose-700' :
          toast.type === 'warning' ? 'bg-amber-900 text-amber-100 border-amber-700' :
          'bg-slate-900 text-slate-100 border-slate-700'
        }`}>
          {toast.type === 'success' && <CheckCircle className="w-5 h-5 text-emerald-400" />}
          {toast.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-400" />}
          {toast.type === 'warning' && <Flag className="w-5 h-5 text-amber-400" />}
          {toast.type === 'info' && <Bell className="w-5 h-5 text-blue-400" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* --- MAIN HEADER / NAVBAR --- */}
      <header className="bg-slate-900 text-white sticky top-0 z-30 shadow-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            
            {/* Logo & Brand */}
            <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab('browse')}>
              <div className="bg-gradient-to-tr from-indigo-500 to-emerald-400 p-2.5 rounded-xl shadow-lg">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <span className="font-extrabold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-indigo-200">
                  Campus Finder
                </span>
                <span className="hidden sm:inline-block ml-2 text-xs font-semibold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  School Portal
                </span>
              </div>
            </div>

            {/* Navigation Tabs */}
            <div className="hidden md:flex items-center space-x-1 bg-slate-800/80 p-1 rounded-xl border border-slate-700/60">
              <button
                onClick={() => setActiveTab('browse')}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                  activeTab === 'browse'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                Browse Items
              </button>
              <button
                onClick={() => setActiveTab('my-posts')}
                className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                  activeTab === 'my-posts'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                My Reported Items
              </button>
              {currentUserRole === 'admin' && (
                <button
                  onClick={() => setActiveTab('admin-panel')}
                  className={`px-4 py-2 text-sm font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                    activeTab === 'admin-panel'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-emerald-400 hover:bg-emerald-900/30 hover:text-emerald-300'
                  }`}
                >
                  <ShieldCheck className="w-4 h-4" />
                  Admin Control
                </button>
              )}
            </div>

            {/* Notification Bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setIsNotificationsOpen(previous => !previous)}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 text-slate-200 transition hover:bg-slate-800 hover:text-white"
                aria-label={`Notifications${unreadNotificationCount ? `, ${unreadNotificationCount} unread` : ''}`}
                aria-expanded={isNotificationsOpen}
              >
                <Bell className="h-5 w-5" />
                {unreadNotificationCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-slate-900 bg-rose-500 px-1 text-[10px] font-extrabold text-white">
                    {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                  </span>
                )}
              </button>

              {isNotificationsOpen && (
                <div role="dialog" aria-label="Notifications" className="fixed left-3 right-3 top-28 z-[60] mx-auto flex max-h-[calc(100dvh-8rem)] w-auto max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white text-slate-800 shadow-2xl md:absolute md:left-auto md:right-0 md:top-full md:mt-3 md:max-h-[calc(100vh-8rem)] md:w-[min(92vw,24rem)] md:max-w-none">
                  <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-extrabold text-slate-900">Notifications</h3>
                      <p className="text-[11px] text-slate-500">
                        {unreadNotificationCount} unread notification{unreadNotificationCount === 1 ? '' : 's'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={handleMarkAllNotificationsRead}
                        disabled={unreadNotificationCount === 0}
                        className="min-h-9 whitespace-nowrap rounded-lg px-2 text-[11px] font-bold text-indigo-600 transition hover:bg-indigo-50 hover:text-indigo-800 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
                      >
                        Mark all read
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsNotificationsOpen(false)}
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                        aria-label="Close notifications"
                        title="Close notifications"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="max-h-[calc(100dvh-14rem)] overflow-y-auto overscroll-contain md:max-h-96">
                    {notificationsLoading ? (
                      <p className="px-4 py-8 text-center text-xs text-slate-500">Loading notifications...</p>
                    ) : notifications.length === 0 ? (
                      <div className="px-5 py-8 text-center">
                        <Bell className="mx-auto mb-2 h-7 w-7 text-slate-300" />
                        <p className="text-sm font-semibold text-slate-700">You’re all caught up</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          Updates from the administrator about your reports will appear here.
                        </p>
                      </div>
                    ) : (
                      notifications.map(notification => (
                        <div
                          key={notification.id}
                          className={`border-b border-slate-100 px-4 py-3 transition ${notification.is_read ? 'bg-white' : 'bg-indigo-50/50'}`}
                        >
                          <div className="flex items-start gap-3">
                            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${notification.is_read ? 'bg-slate-200' : 'bg-indigo-500'}`} />
                            <button
                              type="button"
                              onClick={() => handleOpenNotification(notification)}
                              className="min-w-0 flex-1 text-left hover:opacity-80"
                              title="Open notification"
                            >
                              <span className="flex items-start justify-between gap-2">
                                <span className="break-words text-xs font-extrabold text-slate-900">{notification.title}</span>
                                {!notification.is_read && <span className="shrink-0 text-[9px] font-extrabold uppercase tracking-wide text-indigo-600">New</span>}
                              </span>
                              <span className="mt-1 block break-words text-xs leading-5 text-slate-600">{notification.message}</span>
                              {notification.report_title && (
                                <span className="mt-1 block truncate text-[10px] font-semibold text-slate-500">Report: {notification.report_title}</span>
                              )}
                              <span className="mt-1.5 block text-[10px] text-slate-400">
                                {new Date(notification.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                              </span>
                            </button>
                            <div className="flex shrink-0 items-center gap-1">
                              {!notification.is_read && (
                                <button
                                  type="button"
                                  onClick={() => handleMarkNotificationRead(notification.id)}
                                  className="rounded-lg p-1.5 text-indigo-600 transition hover:bg-indigo-100 hover:text-indigo-800"
                                  title="Mark as read"
                                  aria-label="Mark notification as read"
                                >
                                  <Check className="h-4 w-4" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeleteNotification(notification.id)}
                                className="rounded-lg p-1.5 text-rose-500 transition hover:bg-rose-100 hover:text-rose-700"
                                title="Delete notification"
                                aria-label="Delete notification"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Signed-in student account */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 pl-2 border-l border-slate-700">
                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center font-bold text-white text-sm ring-2 ring-indigo-400/30">
                  {avatarInitial}
                </div>
                <div className="hidden lg:block text-left max-w-44">
                  <p className="text-xs font-bold leading-tight text-slate-100 truncate">{displayName}</p>
                  <p className="text-[10px] text-slate-400 truncate">{user?.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-700 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sign out</span>
              </button>
            </div>

          </div>
        </div>

        {/* Mobile Nav Bar */}
        <div className="md:hidden flex border-t border-slate-800 bg-slate-900/95 px-4 py-2 space-x-2 justify-around">
          <button
            onClick={() => setActiveTab('browse')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg ${activeTab === 'browse' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
          >
            Browse
          </button>
          <button
            onClick={() => setActiveTab('my-posts')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg ${activeTab === 'my-posts' ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}
          >
            My Posts
          </button>
          {currentUserRole === 'admin' && (
            <button
              onClick={() => setActiveTab('admin-panel')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg ${activeTab === 'admin-panel' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}
            >
              Admin Panel
            </button>
          )}
        </div>
      </header>

      {/* --- HERO BANNER & STATS BAR --- */}
      <section className="bg-gradient-to-b from-slate-900 to-slate-800 text-white py-8 px-4 sm:px-6 lg:px-8 border-b border-slate-700/50">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-semibold mb-3">
                <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                <span>School Lost & Found Network</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                {activeTab === 'browse' && 'Find Lost Belongings or Report Found Items'}
                {activeTab === 'my-posts' && 'My Reported Items & Tracked Requests'}
                {activeTab === 'admin-panel' && 'Campus Security Moderation Hub'}
              </h1>
              <p className="text-slate-400 text-sm mt-1 max-w-2xl">
                Quickly reunite students with missing keys, textbooks, electronics, and accessories across campus.
              </p>
            </div>

            {/* Quick Action Button & Stats */}
            <div className="flex flex-wrap items-center gap-4">
              <button
                onClick={() => setIsPostModalOpen(true)}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white font-semibold px-5 py-3 rounded-xl shadow-lg shadow-emerald-900/30 transform transition hover:-translate-y-0.5 active:translate-y-0"
              >
                <PlusCircle className="w-5 h-5" />
                Report Lost / Found Item
              </button>
            </div>
          </div>

          {/* Quick Stats Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-6 pt-6 border-t border-slate-800">
            <div className="bg-slate-800/60 backdrop-blur border border-slate-700/60 rounded-xl p-3 sm:p-4">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                <span>Total Items</span>
                <Layers className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="text-xl sm:text-2xl font-bold mt-1 text-white">{stats.total}</div>
            </div>

            <div className="bg-slate-800/60 backdrop-blur border border-slate-700/60 rounded-xl p-3 sm:p-4">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                <span>Active Lost</span>
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-xl sm:text-2xl font-bold mt-1 text-amber-300">{stats.lost}</div>
            </div>

            <div className="bg-slate-800/60 backdrop-blur border border-slate-700/60 rounded-xl p-3 sm:p-4">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                <span>Items Found</span>
                <CheckCircle className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-xl sm:text-2xl font-bold mt-1 text-emerald-300">{stats.found}</div>
            </div>

            <div className="bg-slate-800/60 backdrop-blur border border-slate-700/60 rounded-xl p-3 sm:p-4">
              <div className="flex items-center justify-between text-slate-400 text-xs font-medium">
                <span>Return Rate</span>
                <Award className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-xl sm:text-2xl font-bold mt-1 text-purple-300">{stats.rate}%</div>
            </div>
          </div>
        </div>
      </section>

      {/* --- MAIN CONTENT AREA --- */}
      <main className="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        {/* --- VIEW 1: BROWSE & MY POSTS --- */}
        {(activeTab === 'browse' || activeTab === 'my-posts') && (
          <div className="space-y-6">
            
            {/* SEARCH & FILTERS CONTROL BAR */}
            <div className="bg-white rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200/80 space-y-4">
              <div className="flex flex-col md:flex-row gap-3">
                {/* Search Bar Input */}
                <div className="relative flex-grow">
                  <Search className="w-5 h-5 absolute left-3.5 top-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by keyword, location (e.g. Library), item name..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm bg-slate-50/50"
                  />
                  {searchQuery && (
                    <button 
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-3 text-slate-400 hover:text-slate-600 text-xs font-semibold"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Type Toggle Pills (All vs Lost vs Found) */}
                <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/80 self-start md:self-auto">
                  <button
                    onClick={() => setSelectedType('all')}
                    className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      selectedType === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All Types
                  </button>
                  <button
                    onClick={() => setSelectedType('lost')}
                    className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                      selectedType === 'lost' ? 'bg-amber-500 text-white shadow-sm' : 'text-amber-700 hover:bg-amber-100/50'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-amber-300"></span>
                    Lost Items
                  </button>
                  <button
                    onClick={() => setSelectedType('found')}
                    className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
                      selectedType === 'found' ? 'bg-emerald-600 text-white shadow-sm' : 'text-emerald-700 hover:bg-emerald-100/50'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-300"></span>
                    Found Items
                  </button>
                </div>

                {/* Sort Dropdown */}
                <div className="flex items-center gap-2">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="w-full sm:w-auto px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-semibold text-slate-700 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="newest">Sort: Newest First</option>
                    <option value="oldest">Sort: Oldest First</option>
                  </select>
                </div>
              </div>

              {/* Category Badges Filter Horizontal Scroll */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1 no-scrollbar">
                <span className="text-xs font-semibold text-slate-400 flex items-center gap-1 shrink-0 mr-1">
                  <Filter className="w-3.5 h-3.5" /> Category:
                </span>
                {CATEGORIES.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-xl whitespace-nowrap transition-all border ${
                      selectedCategory === cat
                        ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* FEED SECTION HEADER */}
            <div className="flex items-center justify-between px-1">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                {activeTab === 'my-posts' ? 'My Reported Posts' : 'Reported Items Feed'}
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700">
                  {filteredItems.length}
                </span>
              </h2>

              {activeTab === 'my-posts' && (
                <p className="text-xs text-slate-500">
                  Showing reports created by your account
                </p>
              )}
            </div>

            {/* LOADING / EMPTY STATE */}
            {itemsLoading && (
              <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center text-sm text-slate-500">Loading reports from Campus Finder...</div>
            )}
            {!itemsLoading && filteredItems.length === 0 && (
              <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-12 text-center my-8">
                <div className="w-14 h-14 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-4">
                  <Search className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-slate-800">{activeTab === 'my-posts' ? 'You have not posted anything yet' : 'No lost or found reports yet'}</h3>
                <p className="text-slate-500 text-sm mt-1 max-w-md mx-auto">
                  New reports will appear here after students submit a lost or found item.
                </p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('All Categories');
                    setSelectedType('all');
                  }}
                  className="mt-4 text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-4 py-2 rounded-lg"
                >
                  Reset All Filters
                </button>
              </div>
            )}

            {/* GRID OF ITEM CARDS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className={`bg-white rounded-2xl border transition-all duration-200 hover:shadow-xl hover:-translate-y-1 flex flex-col overflow-hidden relative ${
                    item.pinned ? 'border-amber-400 ring-2 ring-amber-400/20' : 'border-slate-200/90 shadow-sm'
                  }`}
                >
                  {/* PIN BADGE IF PINNED */}
                  {item.pinned && (
                    <div className="absolute top-3 right-3 z-10 bg-amber-500 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shadow flex items-center gap-1">
                      <Pin className="w-3 h-3 fill-white" /> Pinned
                    </div>
                  )}

                  {/* ITEM IMAGE CONTAINER */}
                  <div className="relative h-48 w-full bg-slate-100 overflow-hidden cursor-pointer" onClick={() => setActiveItemForDetail(item)}>
                    <img
                      src={item.image}
                      alt={item.title}
                      className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                    />

                    {/* TYPE BADGE (LOST vs FOUND) */}
                    <div className="absolute top-3 left-3">
                      {item.type === 'lost' ? (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wide bg-amber-500 text-white shadow-md">
                          <AlertTriangle className="w-3.5 h-3.5" /> Lost
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wide bg-emerald-600 text-white shadow-md">
                          <CheckCircle className="w-3.5 h-3.5" /> Found
                        </span>
                      )}
                    </div>

                    {/* STATUS OVERLAY BADGE */}
                    {(item.cancelledAt || item.status !== 'Active') && (
                      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[2px] flex items-center justify-center">
                        <span className="px-4 py-1.5 rounded-full bg-white text-slate-900 font-extrabold text-xs uppercase tracking-wider shadow-lg">
                          {item.cancelledAt ? 'Cancelled' : item.status}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* CARD CONTENT */}
                  <div className="p-5 flex-grow flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider bg-indigo-50 px-2.5 py-0.5 rounded-md border border-indigo-100">
                          {item.category}
                        </span>
                        <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {item.date}
                        </span>
                      </div>

                      {/* REPORT STATUS: shown in the student's My Reported Items view */}
                      {activeTab === 'my-posts' && (
                        <div className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Report Status</span>
                            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-extrabold ${getReportTrackingStatus(item).classes}`}>
                              {getReportTrackingStatus(item).label}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] leading-4 text-slate-500">
                            {getReportTrackingStatus(item).description}
                          </p>
                        </div>
                      )}

                      <h3
                        onClick={() => setActiveItemForDetail(item)}
                        className="font-bold text-slate-900 text-base leading-snug line-clamp-1 hover:text-indigo-600 cursor-pointer transition-colors"
                      >
                        {item.title}
                      </h3>

                      <p className="text-slate-500 text-xs mt-2 line-clamp-2 leading-relaxed">
                        {item.description}
                      </p>

                      <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                        <div className="flex items-center gap-1.5 text-slate-700 font-medium">
                          <MapPin className="w-4 h-4 text-rose-500 shrink-0" />
                          <span className="truncate">{item.location}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-500">
                          <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>Posted by <strong className="text-slate-700">{item.contactName}</strong></span>
                        </div>
                      </div>
                    </div>

                    {/* CARD FOOTER ACTIONS */}
                    <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        onClick={() => setActiveItemForDetail(item)}
                        className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-3 py-2 rounded-lg hover:bg-slate-100 transition-all"
                      >
                        Details
                      </button>

                      {!item.cancelledAt ? (
                        <button
                          onClick={() => setActiveItemForContact(item)}
                          className={`text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 shadow-sm transition-all ${
                            item.type === 'lost'
                              ? 'bg-amber-500 hover:bg-amber-600 text-white'
                              : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          }`}
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          {item.type === 'lost' ? 'I Found This' : 'Claim Item'}
                        </button>
                      ) : (
                        <span className="text-xs font-bold text-rose-600 px-3.5 py-2">Cancelled</span>
                      )}
                    </div>

                    {/* STUDENT ACTIONS: only the owner can edit or cancel from My Reported Items */}
                    {activeTab === 'my-posts' && currentUserRole !== 'admin' && item.createdById === user?.id && (
                      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2">
                        {item.cancelledAt ? (
                          <span className="text-xs font-semibold text-rose-600 inline-flex items-center gap-1.5">
                            <XCircle className="w-4 h-4" /> Cancelled — editing is unavailable
                          </span>
                        ) : item.status !== 'Active' ? (
                          <span className="text-xs font-semibold text-slate-500">
                            This report is {item.status.toLowerCase()} — editing and cancellation are unavailable
                          </span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditModal(item)}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 text-xs font-bold hover:bg-indigo-100"
                            >
                              <Pencil className="w-3.5 h-3.5" /> Edit Report
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCancelOwnReport(item.id)}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-rose-50 text-rose-700 border border-rose-100 text-xs font-bold hover:bg-rose-100"
                            >
                              <XCircle className="w-3.5 h-3.5" /> Cancel Report
                            </button>
                          </>
                        )}
                      </div>
                    )}

                    {/* ADMIN QUICK ACTIONS INSIDE CARD FOR EASY ACCESS */}
                    {currentUserRole === 'admin' && (
                      <div className="mt-3 pt-2 bg-slate-50 -mx-5 -mb-5 px-5 py-2.5 border-t border-slate-200 flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-500 text-[10px] uppercase">Admin Mod</span>
                        <div className="flex items-center space-x-1">
                          <button
                            onClick={() => handleTogglePin(item.id)}
                            className={`p-1.5 rounded hover:bg-slate-200 ${item.pinned ? 'text-amber-600 font-bold' : 'text-slate-400'}`}
                            title="Pin Post to Top"
                          >
                            <Pin className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleToggleFlag(item.id)}
                            className={`p-1.5 rounded hover:bg-slate-200 ${item.flagged ? 'text-rose-600 font-bold' : 'text-slate-400'}`}
                            title="Flag Post"
                          >
                            <Flag className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteItem(item.id)}
                            className="p-1.5 rounded text-rose-500 hover:bg-rose-50"
                            title="Delete Post"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- VIEW 2: ADMIN MANAGEMENT DASHBOARD --- */}
        {activeTab === 'admin-panel' && currentUserRole === 'admin' && (
          <div className="space-y-8">
            {/* ADMIN SUMMARY METRICS */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-700 text-sm">Resolution Rate</h3>
                  <BarChart2 className="w-5 h-5 text-indigo-500" />
                </div>
                <div className="text-3xl font-black text-slate-900 mt-2">{stats.rate}%</div>
                <p className="text-xs text-slate-500 mt-1">
                  {stats.resolved} of {stats.total} total items safely claimed/resolved
                </p>
                <div className="w-full bg-slate-100 rounded-full h-2 mt-4">
                  <div className="bg-indigo-600 h-2 rounded-full" style={{ width: `${stats.rate}%` }}></div>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-700 text-sm">Lost vs Found Ratio</h3>
                  <Layers className="w-5 h-5 text-amber-500" />
                </div>
                <div className="flex items-baseline space-x-3 mt-2">
                  <span className="text-3xl font-black text-amber-600">{stats.lost}</span>
                  <span className="text-slate-400 font-medium">Lost</span>
                  <span className="text-xl font-bold text-slate-300">/</span>
                  <span className="text-3xl font-black text-emerald-600">{stats.found}</span>
                  <span className="text-slate-400 font-medium">Found</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Active reports queued in the system
                </p>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-700 text-sm">Top Lost Locations</h3>
                  <MapPin className="w-5 h-5 text-rose-500" />
                </div>
                {topLostLocations.length > 0 ? (
                  <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
                    {topLostLocations.map(([location, count], index) => (
                      <li key={location} className="flex justify-between items-center py-1 border-b border-slate-100">
                        <span className="font-medium text-slate-800">{index + 1}. {location}</span>
                        <span className="bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-bold">{count} reports</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-xs text-slate-400">No lost-item locations have been reported yet.</p>
                )}
              </div>
            </div>

            {/* ADMIN POST MODERATION TABLE */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Campus Moderation Queue</h3>
                  <p className="text-slate-500 text-xs mt-0.5">Approve student reports, edit details, update status, or delete posts</p>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 font-medium">Filter Status:</span>
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50"
                  >
                    <option value="all">All Statuses</option>
                    <option value="Active">Active</option>
                    <option value="Claimed">Claimed</option>
                    <option value="Resolved">Resolved</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-[11px] font-bold text-slate-400 uppercase border-b border-slate-200">
                      <th className="py-3.5 px-4">Item Details</th>
                      <th className="py-3.5 px-4">Approval</th>
                      <th className="py-3.5 px-4">Type</th>
                      <th className="py-3.5 px-4">Student Contact</th>
                      <th className="py-3.5 px-4">Date & Location</th>
                      <th className="py-3.5 px-4">Status</th>
                      <th className="py-3.5 px-4 text-right">Moderation Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs text-slate-700">
                    {filteredItems.map(item => (
                      <tr key={item.id} className={`hover:bg-slate-50/80 transition-colors ${item.flagged ? 'bg-rose-50/40' : ''}`}>
                        
                        {/* ITEM CELL */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center space-x-3">
                            {item.image ? <img src={item.image} alt="" className="w-10 h-10 rounded-lg object-cover bg-slate-100 shrink-0" /> : <div className="w-10 h-10 rounded-lg bg-slate-100 shrink-0" />}
                            <div>
                              <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                {item.title}
                                {item.pinned && <Pin className="w-3 h-3 text-amber-500 fill-amber-500" />}
                                {item.flagged && <Flag className="w-3 h-3 text-rose-500 fill-rose-500" />}
                              </div>
                              <span className="text-[10px] text-slate-400 font-semibold">{item.category}</span>
                            </div>
                          </div>
                        </td>

                        {/* APPROVAL STATUS CELL */}
                        <td className="py-3.5 px-4">
                          {item.approvalStatus === 'Approved' ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                              <CheckCircle className="w-3 h-3" /> Approved
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold text-amber-700 border border-amber-200">
                              <Clock className="w-3 h-3" /> Pending
                            </span>
                          )}
                        </td>

                        {/* TYPE CELL */}
                        <td className="py-3.5 px-4">
                          {item.type === 'lost' ? (
                            <span className="px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase bg-amber-100 text-amber-800 border border-amber-200">
                              Lost
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                              Found
                            </span>
                          )}
                        </td>

                        {/* CONTACT CELL */}
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-800">{item.contactName}</div>
                        </td>

                        {/* DATE / LOC CELL */}
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-slate-800">{item.location}</div>
                          <div className="text-[11px] text-slate-400">{item.date}</div>
                        </td>

                        {/* STATUS SELECT */}
                        <td className="py-3.5 px-4">
                          {item.cancelledAt ? (
                            <span className="inline-flex px-2 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold">Cancelled by Student</span>
                          ) : (
                            <select
                              value={item.status}
                              onChange={(e) => handleStatusChange(item.id, e.target.value)}
                              className={`text-xs font-bold px-2 py-1 rounded-lg border ${
                                item.status === 'Active' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                                item.status === 'Claimed' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}
                            >
                              <option value="Active">Active</option>
                              <option value="Claimed">Claimed</option>
                              <option value="Resolved">Resolved</option>
                            </select>
                          )}
                        </td>

                        {/* ACTIONS */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end space-x-2">
                            {!item.cancelledAt && item.approvalStatus !== 'Approved' && (
                              <button
                                onClick={() => handleApproveItem(item.id)}
                                className="p-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100"
                                title="Approve report"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {!item.cancelledAt && (
                              <button
                                onClick={() => openEditModal(item)}
                                className="p-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100"
                                title="Edit report"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleTogglePin(item.id)}
                              className={`p-1.5 rounded-lg border ${
                                item.pinned ? 'bg-amber-500 text-white border-amber-600' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                              }`}
                              title="Pin / Unpin item"
                            >
                              <Pin className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleToggleFlag(item.id)}
                              className={`p-1.5 rounded-lg border ${
                                item.flagged ? 'bg-rose-600 text-white border-rose-700' : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                              }`}
                              title="Flag for review"
                            >
                              <Flag className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              className="p-1.5 rounded-lg bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100"
                              title="Delete Item"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* --- ADMIN MODAL: EDIT REPORT --- */}
      {itemBeingEdited && !itemBeingEdited.cancelledAt && (
        currentUserRole === 'admin' || itemBeingEdited.createdById === user?.id
      ) && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl overflow-hidden my-8">
            <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg">Edit Lost & Found Report</h3>
                <p className="text-xs text-slate-400 mt-1">Update the submitted report details. If you edit an approved report, it will return to Pending for review.</p>
              </div>
              <button
                type="button"
                onClick={() => setItemBeingEdited(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
                disabled={isSavingEdit}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Report Type</label>
                  <select
                    value={editForm.type}
                    onChange={(event) => setEditForm(previous => ({ ...previous, type: event.target.value }))}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white"
                  >
                    <option value="lost">Lost</option>
                    <option value="found">Found</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Category</label>
                  <select
                    value={editForm.category}
                    onChange={(event) => setEditForm(previous => ({ ...previous, category: event.target.value }))}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200 bg-white"
                  >
                    {CATEGORIES.filter(category => category !== 'All Categories').map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Item Title</label>
                <input
                  type="text"
                  required
                  value={editForm.title}
                  onChange={(event) => setEditForm(previous => ({ ...previous, title: event.target.value }))}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Campus Location</label>
                  <input
                    type="text"
                    required
                    value={editForm.location}
                    onChange={(event) => setEditForm(previous => ({ ...previous, location: event.target.value }))}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Date Lost / Found</label>
                  <input
                    type="date"
                    required
                    value={editForm.date}
                    onChange={(event) => setEditForm(previous => ({ ...previous, date: event.target.value }))}
                    className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Student Contact Name</label>
                <input
                  type="text"
                  required
                  value={editForm.contactName}
                  onChange={(event) => setEditForm(previous => ({ ...previous, contactName: event.target.value }))}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Description</label>
                <textarea
                  required
                  rows={4}
                  value={editForm.description}
                  onChange={(event) => setEditForm(previous => ({ ...previous, description: event.target.value }))}
                  className="w-full px-3 py-2.5 text-sm rounded-xl border border-slate-200"
                />
              </div>

              <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl p-3">
                The existing item photo will remain unchanged. Photo replacement is not part of this edit form.
              </p>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setItemBeingEdited(null)}
                  disabled={isSavingEdit}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60"
                >
                  {isSavingEdit ? 'Saving changes...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 1: CREATE NEW POST --- */}
      {isPostModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl overflow-hidden my-8 transform transition-all">
            
            {/* Modal Header */}
            <div className="bg-slate-900 text-white px-6 py-5 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <PlusCircle className="w-5 h-5 text-emerald-400" />
                <h3 className="font-bold text-lg">Report Lost or Found Item</h3>
              </div>
              <button
                onClick={() => setIsPostModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreatePost} className="p-6 space-y-5">
              
              {/* Type Switcher (Lost vs Found) */}
              <div>
                <label className="block text-xs font-extrabold uppercase text-slate-400 tracking-wider mb-2">
                  Report Type
                </label>
                <div className="grid grid-cols-2 gap-3 p-1 bg-slate-100 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setNewItem({ ...newItem, type: 'lost' })}
                    className={`py-2.5 font-extrabold text-sm rounded-lg flex items-center justify-center gap-2 transition-all ${
                      newItem.type === 'lost'
                        ? 'bg-amber-500 text-white shadow-md'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4" />
                    I Lost Something
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewItem({ ...newItem, type: 'found' })}
                    className={`py-2.5 font-extrabold text-sm rounded-lg flex items-center justify-center gap-2 transition-all ${
                      newItem.type === 'found'
                        ? 'bg-emerald-600 text-white shadow-md'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <CheckCircle className="w-4 h-4" />
                    I Found Something
                  </button>
                </div>
              </div>

              {/* Title & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Item Title <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Silver iPad Air with Blue Cover"
                    value={newItem.title}
                    onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Category</label>
                  <select
                    value={newItem.category}
                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50/50 font-medium text-slate-700"
                  >
                    {CATEGORIES.filter(c => c !== 'All Categories').map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Location & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Campus Location <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Main Library 2nd Floor"
                    value={newItem.location}
                    onChange={(e) => setNewItem({ ...newItem, location: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50/50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">Date Lost / Found</label>
                  <input
                    type="date"
                    value={newItem.date}
                    onChange={(e) => setNewItem({ ...newItem, date: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50/50 font-medium"
                  />
                </div>
              </div>

              {/* Upload the real item photo */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Item Photo <span className="text-rose-500">*</span>
                </label>
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <label className="cursor-pointer inline-flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold border border-slate-200 transition-colors">
                    <ImageIcon className="w-4 h-4 text-slate-500" />
                    Choose Photo
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleCustomImageUpload} className="hidden" />
                  </label>
                  {newItem.image ? (
                    <div className="flex items-center gap-3">
                      <img src={newItem.image} alt="Selected item" className="w-16 h-16 rounded-xl object-cover border border-slate-200" />
                      <span className="text-xs text-emerald-700 font-semibold">Photo selected</span>
                      <button type="button" onClick={() => { setNewItem(previous => ({ ...previous, image: '' })); setSelectedImageFile(null); }} className="text-xs text-rose-600 underline">Remove</button>
                    </div>
                  ) : (
                    <span className="text-xs text-slate-400">Upload a photo of the actual lost or found item.</span>
                  )}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Description & Unique Identifiers <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={3}
                  placeholder="Provide details like stickers, serial numbers, case color, scratches, contents..."
                  value={newItem.description}
                  onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                  className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50/50"
                ></textarea>
              </div>

              {/* Contact name is shown on the report; school email stays private. */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <span className="text-[11px] font-extrabold uppercase text-slate-500 tracking-wider">Posted by</span>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Your Name <span className="text-rose-500">*</span></label>
                  <input type="text" required value={newItem.contactName} onChange={(e) => setNewItem({ ...newItem, contactName: e.target.value })} placeholder="Enter your name" className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20" />
                </div>
                <p className="text-[11px] text-slate-500">Your school email is linked to your account and will not be displayed on the public report.</p>
              </div>

              {/* Submit Buttons */}
              <div className="pt-2 flex items-center justify-end space-x-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPostModalOpen(false)}
                  className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingPost}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all disabled:opacity-60"
                >
                  {isSubmittingPost ? 'Uploading and saving...' : 'Publish Report'}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* --- MODAL 2: ITEM DETAIL DRAWER / POPUP --- */}
      {activeItemForDetail && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl overflow-hidden my-8 transform transition-all">
            
            {/* Header Image Box */}
            <div className="relative h-64 bg-slate-900">
              {activeItemForDetail.image ? <img src={activeItemForDetail.image} alt="" className="w-full h-full object-cover opacity-90" /> : <div className="w-full h-full" />}
              <button
                onClick={() => setActiveItemForDetail(null)}
                className="absolute top-4 right-4 bg-slate-900/60 hover:bg-slate-900 text-white p-2 rounded-full backdrop-blur transition-all"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="absolute bottom-4 left-4">
                {activeItemForDetail.type === 'lost' ? (
                  <span className="px-3 py-1 rounded-full text-xs font-extrabold uppercase bg-amber-500 text-white shadow-lg">
                    Lost Item
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full text-xs font-extrabold uppercase bg-emerald-600 text-white shadow-lg">
                    Found Item
                  </span>
                )}
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              <div>
                <div className="flex items-center justify-between text-xs text-indigo-600 font-bold uppercase tracking-wider">
                  <span>{activeItemForDetail.category}</span>
                  <span className="text-slate-400 font-normal">Posted on {activeItemForDetail.date}</span>
                </div>
                <h2 className="text-2xl font-black text-slate-900 mt-1">{activeItemForDetail.title}</h2>
              </div>

              {/* Location Badge */}
              <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-700">
                <MapPin className="w-5 h-5 text-rose-500 shrink-0" />
                <div>
                  <span className="text-xs text-slate-400 block font-bold uppercase">Location</span>
                  <span className="font-semibold">{activeItemForDetail.location}</span>
                </div>
              </div>

              {/* Description */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Full Description</h4>
                <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100">
                  {activeItemForDetail.description}
                </p>
              </div>

              {/* Poster Contact Info */}
              <div className="p-4 rounded-xl bg-indigo-50/50 border border-indigo-100 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
                    {activeItemForDetail.contactName.charAt(0)}
                  </div>
                  <div>
                    <h5 className="font-bold text-slate-900 text-sm">{activeItemForDetail.contactName}</h5>
                    <p className="text-xs text-slate-500">Campus Finder student</p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    setActiveItemForContact(activeItemForDetail);
                    setActiveItemForDetail(null);
                  }}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow transition-all flex items-center gap-1.5"
                >
                  <MessageSquare className="w-4 h-4" />
                  Contact Poster
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

      {/* --- MODAL 3: CONTACT & IN-APP MESSAGING / CLAIM DRAWER --- */}
      {activeItemForContact && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden my-8 flex flex-col h-[600px]">
            
            {/* Header */}
            <div className="bg-slate-900 text-white p-4 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center space-x-3">
                {activeItemForContact.image ? <img src={activeItemForContact.image} alt="" className="w-9 h-9 rounded-lg object-cover bg-slate-800" /> : <div className="w-9 h-9 rounded-lg bg-slate-800" />}
                <div>
                  <h3 className="font-bold text-sm leading-tight text-white line-clamp-1">{activeItemForContact.title}</h3>
                  <p className="text-[11px] text-slate-400">Contacting {activeItemForContact.contactName}</p>
                </div>
              </div>
              <button
                onClick={() => setActiveItemForContact(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Mode Toggle (Message vs Claim Request) */}
            <div className="bg-slate-100 p-2 flex gap-2 border-b border-slate-200 text-xs font-bold">
              <button
                onClick={() => setIsClaiming(false)}
                className={`flex-1 py-1.5 rounded-lg transition-all ${!isClaiming ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}
              >
                Direct Message
              </button>
              <button
                onClick={() => setIsClaiming(true)}
                className={`flex-1 py-1.5 rounded-lg transition-all ${isClaiming ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
              >
                Submit Official Claim Request
              </button>
            </div>

            {/* Chat Messages Log */}
            <div className="flex-grow p-4 overflow-y-auto space-y-3 bg-slate-50/50">
              <div className="text-center my-2">
                <span className="text-[10px] font-semibold text-slate-400 bg-slate-200/60 px-2.5 py-1 rounded-full">
                  Messaging will be available after the private messaging feature is connected.
                </span>
              </div>

              {messages.filter(m => m.itemId === activeItemForContact.id).map(msg => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.sender === displayName ? 'items-end' : 'items-start'}`}
                >
                  <div className={`max-w-[85%] rounded-2xl p-3 text-xs shadow-sm ${
                    msg.sender === displayName
                      ? 'bg-indigo-600 text-white rounded-br-none'
                      : 'bg-white text-slate-800 border border-slate-200 rounded-bl-none'
                  }`}>
                    <div className="font-bold text-[10px] opacity-75 mb-0.5">{msg.sender}</div>
                    <p className="leading-relaxed">{msg.text}</p>
                    <div className="text-[9px] opacity-60 text-right mt-1">{msg.time}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* CANNED QUICK REPLIES */}
            {!isClaiming && (
              <div className="px-4 py-2 bg-white border-t border-slate-100 flex gap-2 overflow-x-auto no-scrollbar">
                {[
                  "Hi! I think this is my item.",
                  "Where can we meet on campus?",
                  "Is this item still available?",
                  "I left this in room 204 earlier."
                ].map((quickText, idx) => (
                  <button
                    key={idx}
                    onClick={() => setNewMessageText(quickText)}
                    className="text-[11px] font-medium bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1 rounded-full whitespace-nowrap transition-colors"
                  >
                    {quickText}
                  </button>
                ))}
              </div>
            )}

            {/* INPUT FOOTER */}
            <div className="p-3 bg-white border-t border-slate-200">
              {isClaiming ? (
                <div className="space-y-3">
                  <textarea
                    rows={3}
                    placeholder="Describe specific features, proof of ownership, or hidden marks to verify this is yours..."
                    value={claimNote}
                    onChange={(e) => setClaimNote(e.target.value)}
                    className="w-full text-xs p-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  ></textarea>
                  <button
                    onClick={handleSendMessage}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow transition-colors flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Submit Claim Verification
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Type your message..."
                    value={newMessageText}
                    onChange={(e) => setNewMessageText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    className="flex-grow text-xs px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                  <button
                    onClick={handleSendMessage}
                    className="p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow transition-all shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* --- FOOTER --- */}
      <footer className="bg-slate-900 text-slate-400 py-8 border-t border-slate-800 text-xs mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span className="font-bold text-slate-200">Campus Lost & Found System</span>
            <span>• Student & Security Portal</span>
          </div>
          <div className="text-slate-400 text-center sm:text-right">
            For help, contact your school's official office or administrator.
          </div>
        </div>
      </footer>

    </div>
  );
}