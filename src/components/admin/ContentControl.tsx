
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Plus, Edit, Trash2, Eye, Search, Globe, AlertCircle, CheckCircle, XCircle, Loader2, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { useConfirm } from '@/contexts/ConfirmContext';

interface Announcement {
  id: string;
  title: string;
  content: string;
  type: 'info' | 'warning' | 'success' | 'error' | 'maintenance';
  target_audience: string[];
  status: 'draft' | 'published' | 'archived';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  published_at?: string;
  expires_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
  creator?: {
    name: string;
  };
}

export function ContentControl() {
  const confirm = useConfirm();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<Announcement | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    type: 'info' as Announcement['type'],
    target_audience: ['all'],
    priority: 'normal' as Announcement['priority'],
    expires_at: '',
  });

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  const fetchAnnouncements = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('announcements')
        .select(`
          *,
          creator:profiles!announcements_created_by_fkey(name)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAnnouncements((data ?? []) as Announcement[]);
    } catch (error) {
      console.error('Error fetching announcements:', error);
      toast.error('Failed to load announcements');
    } finally {
      setLoading(false);
    }
  };

  const refreshData = async () => {
    setRefreshing(true);
    await fetchAnnouncements();
    setRefreshing(false);
  };

  const resetForm = () => {
    setFormData({
      title: '',
      content: '',
      type: 'info',
      target_audience: ['all'],
      priority: 'normal',
      expires_at: '',
    });
  };

  const handleCreateAnnouncement = async () => {
    if (!(await confirm({ title: 'Are you sure you want to create this announcement?', confirmLabel: 'Yes, create' }))) return;
    if (!formData.title || !formData.content) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const { error } = await supabase
        .from('announcements')
        .insert([{
          ...formData,
          created_by: user?.id,
      status: 'draft',
        }]);

      if (error) throw error;

      toast.success('Announcement created successfully!');
      setIsCreateDialogOpen(false);
      resetForm();
      fetchAnnouncements();
    } catch (error) {
      console.error('Error creating announcement:', error);
      toast.error('Failed to create announcement');
    }
  };

  const handleUpdateAnnouncement = async () => {
    if (!(await confirm({ title: 'Are you sure you want to save these changes?', confirmLabel: 'Yes, save' }))) return;
    if (!selectedAnnouncement) return;

    try {
      const { error } = await supabase
        .from('announcements')
        .update({
          title: formData.title,
          content: formData.content,
          type: formData.type,
          target_audience: formData.target_audience,
          priority: formData.priority,
          expires_at: formData.expires_at || null,
        })
        .eq('id', selectedAnnouncement.id);

      if (error) throw error;

      toast.success('Announcement updated successfully!');
      setIsEditDialogOpen(false);
      setSelectedAnnouncement(null);
      resetForm();
      fetchAnnouncements();
    } catch (error) {
      console.error('Error updating announcement:', error);
      toast.error('Failed to update announcement');
    }
  };

  const handleDeleteAnnouncement = async (id: string) => {
    if (!(await confirm({ title: 'Are you sure you want to delete this announcement?', description: 'This can’t be undone.', confirmLabel: 'Yes, delete', destructive: true }))) return;

    try {
      const { error } = await supabase
        .from('announcements')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Announcement deleted successfully!');
      fetchAnnouncements();
    } catch (error) {
      console.error('Error deleting announcement:', error);
      toast.error('Failed to delete announcement');
    }
  };

  const handlePublishAnnouncement = async (id: string) => {
    if (!(await confirm({ title: 'Are you sure you want to publish this announcement?', description: 'Everyone in its audience will see it.', confirmLabel: 'Yes, publish' }))) return;
    try {
      const { error } = await supabase
        .from('announcements')
        .update({
      status: 'published',
          published_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      toast.success('Announcement published successfully!');
      fetchAnnouncements();
    } catch (error) {
      console.error('Error publishing announcement:', error);
      toast.error('Failed to publish announcement');
    }
  };

  const handleArchiveAnnouncement = async (id: string) => {
    if (!(await confirm({ title: 'Are you sure you want to archive this announcement?', description: 'It stops showing to users.', confirmLabel: 'Yes, archive', destructive: true }))) return;
    try {
      const { error } = await supabase
        .from('announcements')
        .update({ status: 'archived' })
        .eq('id', id);

      if (error) throw error;

      toast.success('Announcement archived successfully!');
      fetchAnnouncements();
    } catch (error) {
      console.error('Error archiving announcement:', error);
      toast.error('Failed to archive announcement');
    }
  };

  const openEditDialog = (announcement: Announcement) => {
    setSelectedAnnouncement(announcement);
    setFormData({
      title: announcement.title,
      content: announcement.content,
      type: announcement.type,
      target_audience: announcement.target_audience,
      priority: announcement.priority,
      expires_at: announcement.expires_at ? announcement.expires_at.split('T')[0] : '',
    });
    setIsEditDialogOpen(true);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return <Badge className="bg-green-100 text-green-800"><CheckCircle className="w-3 h-3 mr-1" />Published</Badge>;
      case 'draft':
        return <Badge className="bg-gray-100 text-gray-800"><Edit className="w-3 h-3 mr-1" />Draft</Badge>;
      case 'archived':
        return <Badge className="bg-red-100 text-red-800"><XCircle className="w-3 h-3 mr-1" />Archived</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'info':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Info</Badge>;
      case 'warning':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Warning</Badge>;
      case 'success':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Success</Badge>;
      case 'error':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Error</Badge>;
      case 'maintenance':
        return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Maintenance</Badge>;
      default:
        return <Badge>{type}</Badge>;
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'urgent':
        return <Badge className="bg-red-600 text-white">Urgent</Badge>;
      case 'high':
        return <Badge className="bg-orange-500 text-white">High</Badge>;
      case 'normal':
        return <Badge variant="outline">Normal</Badge>;
      case 'low':
        return <Badge variant="outline" className="text-gray-500">Low</Badge>;
      default:
        return <Badge>{priority}</Badge>;
    }
  };

  const filteredAnnouncements = announcements.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         item.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchesType = typeFilter === 'all' || item.type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const stats = [
    { 
      title: "Total Announcements", 
      value: announcements.length.toString(), 
      icon: FileText, 
      color: "text-blue-600" 
    },
    { 
      title: "Published", 
      value: announcements.filter(a => a.status === 'published').length.toString(), 
      icon: Globe, 
      color: "text-green-600" 
    },
    { 
      title: "Draft", 
      value: announcements.filter(a => a.status === 'draft').length.toString(), 
      icon: Edit, 
      color: "text-yellow-600" 
    },
    { 
      title: "Active", 
      value: announcements.filter(a => 
        a.status === 'published' && 
        (!a.expires_at || new Date(a.expires_at) > new Date())
      ).length.toString(), 
      icon: CheckCircle, 
      color: "text-purple-600" 
    }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Content Management</h1>
          <p className="text-gray-600">Manage system announcements and notifications</p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={(open) => {
          setIsCreateDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Create Announcement
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Announcement</DialogTitle>
              <DialogDescription>
                Create a new announcement for users
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div>
                <Label htmlFor="title">Title *</Label>
                <Input 
                  id="title" 
                  placeholder="Announcement title" 
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="type">Type *</Label>
                  <Select value={formData.type} onValueChange={(value: any) => setFormData({...formData, type: value})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="info">Info</SelectItem>
                      <SelectItem value="warning">Warning</SelectItem>
                      <SelectItem value="success">Success</SelectItem>
                      <SelectItem value="error">Error</SelectItem>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="priority">Priority *</Label>
                  <Select value={formData.priority} onValueChange={(value: any) => setFormData({...formData, priority: value})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="target">Target Audience *</Label>
                  <Select 
                    value={formData.target_audience[0]} 
                    onValueChange={(value) => setFormData({...formData, target_audience: [value]})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Users</SelectItem>
                      <SelectItem value="customer">Customers</SelectItem>
                      <SelectItem value="vendor">Vendors</SelectItem>
                      <SelectItem value="rider">Riders</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="expires">Expires At (Optional)</Label>
                  <Input 
                    id="expires" 
                    type="date"
                    value={formData.expires_at}
                    onChange={(e) => setFormData({...formData, expires_at: e.target.value})}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="content">Content *</Label>
                <Textarea 
                  id="content" 
                  placeholder="Write your announcement here..." 
                  className="min-h-32"
                  value={formData.content}
                  onChange={(e) => setFormData({...formData, content: e.target.value})}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateAnnouncement}>
                Create Announcement
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {stats.map((stat, index) => (
          <Card key={index}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stat.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between space-y-2 md:space-y-0 gap-4">
        <div className="relative w-full md:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
          <Input
            type="search"
            placeholder="Search announcements..."
            className="w-full pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="info">Info</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="maintenance">Maintenance</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={refreshData} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Globe className="h-4 w-4" />}
            <span className="ml-2">Refresh</span>
          </Button>
        </div>
      </div>

      {/* Announcements Table */}
          <Card>
            <CardHeader>
          <CardTitle>Announcements</CardTitle>
              <CardDescription>
            Manage system announcements and notifications for all user types
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Expires</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
              {filteredAnnouncements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-gray-500 py-8">
                    No announcements found
                  </TableCell>
                </TableRow>
              ) : (
                filteredAnnouncements.map((announcement) => (
                  <TableRow key={announcement.id}>
                      <TableCell>
                          <div>
                        <div className="font-medium">{announcement.title}</div>
                        <div className="text-sm text-gray-500 truncate max-w-xs">
                          {announcement.content.substring(0, 60)}...
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{getTypeBadge(announcement.type)}</TableCell>
                    <TableCell>{getStatusBadge(announcement.status)}</TableCell>
                    <TableCell>{getPriorityBadge(announcement.priority)}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {announcement.target_audience.map((audience, idx) => (
                          <Badge key={idx} variant="outline" className="text-xs capitalize">
                            {audience}
                          </Badge>
                        ))}
                          </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(announcement.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-sm">
                      {announcement.expires_at ? (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(announcement.expires_at).toLocaleDateString()}
                        </div>
                      ) : (
                        <span className="text-gray-400">Never</span>
                      )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                              <Button 
                                variant="ghost" 
                                size="sm"
                          onClick={() => openEditDialog(announcement)}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                        {announcement.status === 'draft' && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                            onClick={() => handlePublishAnnouncement(announcement.id)}
                            className="text-green-600"
                            >
                              <Globe className="w-4 h-4" />
                            </Button>
                          )}
                        {announcement.status === 'published' && (
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleArchiveAnnouncement(announcement.id)}
                            className="text-orange-600"
                          >
                            <XCircle className="w-4 h-4" />
                          </Button>
                        )}
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleDeleteAnnouncement(announcement.id)}
                          className="text-red-600"
                        >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

      {/* Edit Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
        setIsEditDialogOpen(open);
        if (!open) {
          setSelectedAnnouncement(null);
          resetForm();
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Announcement</DialogTitle>
            <DialogDescription>
              Update announcement information
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
                <div>
              <Label htmlFor="edit-title">Title *</Label>
              <Input 
                id="edit-title" 
                value={formData.title}
                onChange={(e) => setFormData({...formData, title: e.target.value})}
              />
                </div>
            <div className="grid grid-cols-2 gap-4">
                <div>
                <Label htmlFor="edit-type">Type *</Label>
                <Select value={formData.type} onValueChange={(value: any) => setFormData({...formData, type: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="success">Success</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
                </div>
                <div>
                <Label htmlFor="edit-priority">Priority *</Label>
                <Select value={formData.priority} onValueChange={(value: any) => setFormData({...formData, priority: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
                </div>
                  </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="edit-target">Target Audience *</Label>
                <Select 
                  value={formData.target_audience[0]} 
                  onValueChange={(value) => setFormData({...formData, target_audience: [value]})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    <SelectItem value="customer">Customers</SelectItem>
                    <SelectItem value="vendor">Vendors</SelectItem>
                    <SelectItem value="rider">Riders</SelectItem>
                  </SelectContent>
                </Select>
                  </div>
              <div>
                <Label htmlFor="edit-expires">Expires At (Optional)</Label>
                <Input 
                  id="edit-expires" 
                  type="date"
                  value={formData.expires_at}
                  onChange={(e) => setFormData({...formData, expires_at: e.target.value})}
                />
                  </div>
                </div>
            <div>
              <Label htmlFor="edit-content">Content *</Label>
              <Textarea 
                id="edit-content" 
                value={formData.content}
                onChange={(e) => setFormData({...formData, content: e.target.value})}
                className="min-h-32"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateAnnouncement}>
              Update Announcement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
