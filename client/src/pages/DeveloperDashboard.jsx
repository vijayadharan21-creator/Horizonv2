import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRouter } from '../router/Router';
import Sidebar from '../components/Sidebar';
import TopNav from '../components/TopNav';
import CreateTaskModal from '../components/CreateTaskModal';
import OverviewView from '../components/views/OverviewView';
import MainTableView from '../components/views/MainTableView';
import GanttTimelineView from '../components/views/GanttTimelineView';
import TaskAllocationView from '../components/views/TaskAllocationView';
import AnalyticsView from '../components/views/AnalyticsView';
import RecoveryCenterView from '../components/views/RecoveryCenterView';
import ProfileView from '../components/views/ProfileView';
import DependencyGraphView from '../components/views/DependencyGraphView';
import { projectsApi, tasksApi } from '../api/index.js';
import InviteTeamModal from '../components/InviteTeamModal.jsx';
import TeamView from '../components/views/TeamView.jsx';
import CreateProjectSrsModal from '../components/CreateProjectSrsModal.jsx';

export const DeveloperDashboard = () => {
  const { user, logout } = useAuth();
  const { navigate } = useRouter();

  const isPM = user?.role === 'project_manager';

  // ── Navigation state ──────────────────────────────────────────────────────
  const [currentTab, setCurrentTab] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isSrsModalOpen, setIsSrsModalOpen] = useState(false);

  // ── Data state ────────────────────────────────────────────────────────────
  const [projects, setProjects] = useState([]);
  const [currentProject, setCurrentProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [groups, setGroups] = useState(['To Do', 'In Progress', 'In Review', 'Completed']);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [loadingTasks, setLoadingTasks] = useState(false);

  // ── Security guard: developers cannot access PM-only views ────────────────
  useEffect(() => {
    if (!isPM && currentTab === 'task-allocation') setCurrentTab('my-tasks');
  }, [isPM, currentTab]);

  // ── Load projects on mount ────────────────────────────────────────────────
  const loadProjects = useCallback(async () => {
    try {
      setLoadingProjects(true);
      const res = await projectsApi.getAll();
      if (res.success && res.projects.length > 0) {
        setProjects(res.projects);
        setCurrentProject((prev) => {
          if (prev?.id) {
            const stillThere = res.projects.find((p) => p.id === prev.id || p._id === prev.id);
            if (stillThere) return { ...stillThere, id: stillThere.id || stillThere._id };
          }
          return res.projects[0];
        });
      } else if (res.success) {
        setProjects([]);
        setCurrentProject(null);
      }
    } catch (err) {
      console.error('[Dashboard] Failed to load projects:', err.message);
    } finally {
      setLoadingProjects(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // ── Load tasks whenever current project changes ───────────────────────────
  const loadTasks = useCallback(async () => {
    if (!currentProject?.id) return;
    try {
      setLoadingTasks(true);
      let res;
      if (isPM) {
        res = await tasksApi.getByProject(currentProject.id);
      } else {
        // Developer: load tasks for the current project matching their assigned role
        res = await tasksApi.getByProject(currentProject.id);
        // If current project has 0 tasks for them, also check getMyTasks to ensure all assigned tasks are visible
        if (!res.success || !res.tasks || res.tasks.length === 0) {
          const myRes = await tasksApi.getMyTasks();
          if (myRes.success && myRes.tasks?.length > 0) {
            const currentProjTasks = myRes.tasks.filter(
              (t) => String(t.project?.id || t.project?._id || t.project) === String(currentProject.id)
            );
            res = currentProjTasks.length > 0 ? { success: true, tasks: currentProjTasks } : myRes;
          }
        }
      }
      if (res.success) {
        setTasks(res.tasks || []);
      }
    } catch (err) {
      console.error('[Dashboard] Failed to load tasks:', err.message);
    } finally {
      setLoadingTasks(false);
    }
  }, [currentProject, isPM]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // ── Load team members when current project changes (PM only) ─────────────
  const loadTeamMembers = useCallback(async () => {
    if (!currentProject?.id || !isPM) return;
    try {
      const res = await projectsApi.getMembers(currentProject.id);
      if (res.success) {
        const memberNames = res.members.map((m) => m.name);
        if (res.manager && !memberNames.includes(res.manager.name)) {
          memberNames.unshift(res.manager.name);
        }
        setTeamMembers(memberNames);
      }
    } catch (err) {
      console.error('[Dashboard] Failed to load team members:', err.message);
    }
  }, [currentProject, isPM]);

  useEffect(() => {
    loadTeamMembers();
  }, [loadTeamMembers]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleSelectProject = (project) => {
    setCurrentProject(project);
  };

  const handleAddProject = async (name) => {
    if (!isPM) return;
    try {
      const res = await projectsApi.create({ name });
      if (res.success) {
        const newProj = res.project;
        setProjects((prev) => [newProj, ...prev]);
        setCurrentProject(newProj);
      }
    } catch (err) {
      console.error('[Dashboard] Failed to create project:', err.message);
    }
  };

  const handleProjectCreatedFromSrs = async (newProj, createdTasks) => {
    if (!newProj) return;
    const normalized = { ...newProj, id: newProj.id || newProj._id };
    setProjects((prev) => [normalized, ...prev.filter((p) => p.id !== normalized.id)]);
    setCurrentProject(normalized);
    if (createdTasks && createdTasks.length > 0) {
      setTasks(createdTasks);
    }
    setCurrentTab('overview');
    await loadProjects();
  };

  const handleAddTask = async (newTaskData) => {
    if (!isPM || !currentProject?.id) return;
    try {
      // Map frontend task data to API shape
      const payload = {
        title: newTaskData.title,
        description: newTaskData.description || '',
        group: newTaskData.group || 'To Do',
        status: newTaskData.status || 'Pending',
        priority: newTaskData.priority || 'Medium',
        assigneeName: newTaskData.assigneeName || newTaskData.assignee || 'Unassigned',
        assigneeId: newTaskData.assigneeId || null,
        effortHours: Number(newTaskData.effortHours) || 0,
        dueDate: newTaskData.dueDate || '',
        startDate: newTaskData.startDate || '',
        dependency: newTaskData.dependency === 'None' ? null : newTaskData.dependency || null,
      };

      const res = await tasksApi.create(currentProject.id, payload);
      if (res.success && res.task) {
        setTasks((prev) => [res.task, ...prev]);
        // Update project task count in local state
        setCurrentProject((prev) => ({
          ...prev,
          tasksCount: (prev?.tasksCount || 0) + 1,
        }));
        setProjects((prev) =>
          prev.map((p) =>
            p.id === currentProject.id
              ? { ...p, tasksCount: (p.tasksCount || 0) + 1 }
              : p
          )
        );
        loadTasks();
      }
    } catch (err) {
      console.error('[Dashboard] Failed to create task:', err.response?.data?.message || err.message);
    }
  };

  const handleUpdateTask = async (taskId, updates) => {
    try {
      // Optimistic UI update
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId || t.taskId === taskId ? { ...t, ...updates } : t))
      );

      // Find the MongoDB _id from our tasks list
      const task = tasks.find((t) => t.id === taskId || t.taskId === taskId);
      const mongoId = task?.id || taskId;

      await tasksApi.update(mongoId, updates);
    } catch (err) {
      console.error('[Dashboard] Failed to update task:', err.message);
      // Revert optimistic update on failure
      loadTasks();
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!isPM) return;
    try {
      const task = tasks.find((t) => t.id === taskId || t.taskId === taskId);
      const mongoId = task?.id || taskId;

      await tasksApi.delete(mongoId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId && t.taskId !== taskId));
      setCurrentProject((prev) => ({
        ...prev,
        tasksCount: Math.max(0, (prev.tasksCount || 1) - 1),
      }));
    } catch (err) {
      console.error('[Dashboard] Failed to delete task:', err.message);
    }
  };

  const handleAddGroup = (groupName) => {
    if (!isPM) return;
    if (!groups.includes(groupName)) {
      setGroups((prev) => [...prev, groupName]);
    }
  };

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loadingProjects) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <div className="w-9 h-9 border-3 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-3"></div>
        <p className="text-xs font-semibold text-slate-500">Loading your workspace...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#f8fafc] text-slate-800 font-sans overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        user={user}
        onLogout={handleLogout}
        isPM={isPM}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Navbar */}
        <TopNav
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onCreateTaskClick={() => setIsCreateModalOpen(true)}
          user={user}
          currentProject={currentProject}
          projects={projects}
          onSelectProject={handleSelectProject}
          onAddProject={handleAddProject}
          isPM={isPM}
          tasks={tasks}
          onProjectJoined={async () => {
            await loadProjects();
            await loadTasks();
          }}
          onNavigateToProfile={() => setCurrentTab('profile')}
          onOpenSrsModal={() => setIsSrsModalOpen(true)}
        />

        {/* Tab View Router */}
        <main className="flex-1 overflow-y-auto custom-scrollbar min-w-0 pb-12">
          {currentTab === 'overview' && (
            <OverviewView
              tasks={tasks}
              currentProject={currentProject}
              onCreateTaskClick={() => setIsCreateModalOpen(true)}
              onNavigateToTab={setCurrentTab}
              isPM={isPM}
            />
          )}

          {currentTab === 'main-table' && (
            <MainTableView
              tasks={tasks}
              onUpdateTask={handleUpdateTask}
              onDeleteTask={handleDeleteTask}
              onAddTask={handleAddTask}
              groups={groups}
              onAddGroup={handleAddGroup}
              onCreateTaskClick={() => setIsCreateModalOpen(true)}
              searchQuery={searchQuery}
              isPM={isPM}
              teamMembers={teamMembers}
              user={user}
            />
          )}

          {currentTab === 'timeline' && (
            <GanttTimelineView
              tasks={tasks}
              currentProject={currentProject}
              onUpdateTask={handleUpdateTask}
              onCreateTaskClick={() => setIsCreateModalOpen(true)}
              isPM={isPM}
            />
          )}

          {currentTab === 'task-allocation' && isPM && (
            <TaskAllocationView
              tasks={tasks}
              currentProject={currentProject}
              onUpdateTask={handleUpdateTask}
              onCreateTaskClick={() => setIsCreateModalOpen(true)}
              onInviteClick={() => setIsInviteModalOpen(true)}
              isPM={isPM}
              currentUserName={user?.name || 'Developer'}
            />
          )}

          {currentTab === 'my-tasks' && !isPM && (
            <TaskAllocationView
              tasks={tasks}
              currentProject={currentProject}
              onUpdateTask={handleUpdateTask}
              onCreateTaskClick={() => setIsCreateModalOpen(true)}
              isPM={false}
              currentUserName={user?.name || 'Developer'}
            />
          )}

          {currentTab === 'team' && isPM && (
            <TeamView
              currentProject={currentProject}
              onInviteSent={() => loadTasks()}
            />
          )}

          {currentTab === 'analytics' && (
            <AnalyticsView tasks={tasks} currentProject={currentProject} />
          )}

          {currentTab === 'recovery-center' && (
            <RecoveryCenterView
              tasks={tasks}
              currentProject={currentProject}
              isPM={isPM}
              onTriggerReplan={async () => {
                await loadTasks();
                await loadProjects();
                await loadTeamMembers();
              }}
            />
          )}

          {currentTab === 'dependencies' && (
            <DependencyGraphView tasks={tasks} />
          )}

          {currentTab === 'profile' && <ProfileView user={user} isPM={isPM} />}
        </main>
      </div>

      {/* Task Creation Modal (PM only) */}
      {isPM && (
        <CreateTaskModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onAddTask={handleAddTask}
          currentProject={currentProject}
          onTasksCreated={() => loadTasks()}
          groups={groups}
          existingTasks={tasks}
          teamMembers={teamMembers}
        />
      )}

      {/* Invite Team Modal (PM only) */}
      {isPM && (
        <InviteTeamModal
          isOpen={isInviteModalOpen}
          onClose={() => setIsInviteModalOpen(false)}
          currentProject={currentProject}
        />
      )}

      {/* SRS Document AI Project Setup Modal (PM only) */}
      {isPM && (
        <CreateProjectSrsModal
          isOpen={isSrsModalOpen}
          onClose={() => setIsSrsModalOpen(false)}
          onProjectCreated={handleProjectCreatedFromSrs}
        />
      )}
    </div>
  );
};

export default DeveloperDashboard;
