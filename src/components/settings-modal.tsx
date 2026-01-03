"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import Swal from "sweetalert2";
import { ArrowRightLeft, Trash2, Check, Minus } from "lucide-react";
import { useEntitlements } from "@/hooks/use-entitlements";

type SettingsTab =
  | "profile"
  | "subscription"
  | "general"
  | "invitations"
  | "workspaces"
  | "organizations"
  | "categories"
  | "integrations"
  | "ai"
  | "due_dates";

type SettingsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
};

type ProfileResponse = {
  user: { id: string; name: string; email: string };
  memberships: Array<{
    workspaceId: string;
    workspaceName: string;
    workspaceType: string;
    role: string;
  }>;
};

type SettingsResponse = {
  settings: {
    appearance: "light" | "dark";
    task_add_position: "top" | "bottom";
    default_est_minutes: number;
    due_soon_days: number;
    ai_confirm: number;
    ai_routine: string | null;
    ai_work_hours: string | null;
    ai_preferences: string | null;
  };
};

type OrgResponse = {
  orgs: Array<{
    id: string;
    name: string;
    slug: string;
    role: "owner" | "admin" | "supervisor" | "member";
  }>;
};

type OrgMembersResponse = {
  members: Array<{
    id: string;
    user_id: string;
    role: string;
    status: string;
    name: string;
    email: string;
  }>;
};

type OrgInvitesResponse = {
  invites: Array<{
    id: string;
    email: string;
    role: string;
    token: string;
    expires_at: string;
    accepted_at: string | null;
    created_at: string;
  }>;
};

type PendingInvitesResponse = {
  invites: Array<{
    id: string;
    org_id: string;
    org_name: string;
    role: string;
    token: string;
    expires_at: string;
    created_at: string;
  }>;
};

type UserSearchResponse = {
  users: Array<{ id: string; name: string; email: string }>;
};

type WorkspacesResponse = {
  workspaces: Array<{
    id: string;
    name: string;
    type: "personal" | "organization";
    role: string;
    org_id: string | null;
    is_default: number;
  }>;
};

type PlanResponse = {
  plans: Array<{
    key: "free" | "pro" | "enterprise";
    name: string;
    price_monthly: number;
    features: Record<string, boolean>;
    limits: Record<string, number>;
  }>;
};

type OrgWorkspacesResponse = {
  workspaces: Array<{
    id: string;
    name: string;
    type: "organization";
    org_id: string;
    is_default: number;
    created_at: string;
  }>;
};

type WorkspaceMembersResponse = {
  members: Array<{
    id: string;
    user_id: string;
    role: string;
    name: string;
    email: string;
  }>;
};

type WorkspaceCategoriesResponse = {
  categories: Array<{ id: string; name: string; color: string }>;
  role: "member" | "supervisor" | "admin";
};
const applyTheme = (appearance: "light" | "dark") => {
  const root = document.documentElement;
  root.classList.toggle("dark", appearance === "dark");
};

export function SettingsModal({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
}: SettingsModalProps) {
  const [isMounted, setIsMounted] = useState(false);
  const queryClient = useQueryClient();
  const entitlementsQuery = useEntitlements(isOpen);
  const isAdmin = Boolean(entitlementsQuery.data?.entitlements?.isAdmin);
  const formatEntitlementKey = (value: string) =>
    value.replace(/^[^.]+\./, "").replace(/_/g, " ");
  const canUseAi =
    entitlementsQuery.data?.entitlements.features["feature.ai_assistant"] ?? false;
  const canUseIntegrations =
    entitlementsQuery.data?.entitlements.features["feature.integrations"] ?? false;
  const canUseDueDates =
    entitlementsQuery.data?.entitlements.features["feature.due_dates"] ?? false;
  const usage = entitlementsQuery.data?.usage ?? {};
  const limits = entitlementsQuery.data?.entitlements.limits ?? {};
  const isLimitReached = (key: string) =>
    typeof limits[key] === "number" &&
    typeof usage[key.replace("limit.", "")] === "number" &&
    usage[key.replace("limit.", "")] >= limits[key];
  const orgLimitReached = !isAdmin && isLimitReached("limit.organizations");
  const personalWorkspaceLimitReached =
    !isAdmin && isLimitReached("limit.personal_workspaces");

  type PlanDraft = {
    key: "free" | "pro" | "enterprise";
    name: string;
    price_monthly: number;
    features: Record<string, boolean>;
    limits: Record<string, number>;
  };
  const [planDrafts, setPlanDrafts] = useState<Record<string, PlanDraft>>({});
  const [showPlanPicker, setShowPlanPicker] = useState(false);

  const UpgradeNotice = ({ featureLabel }: { featureLabel: string }) => (
    <Card>
      <CardHeader>
        <CardTitle>{featureLabel} requires an upgrade</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          This feature is not available on your current plan.
        </p>
        <Button
          onClick={() => onTabChange("subscription")}
          className="w-fit"
        >
          View plans
        </Button>
      </CardContent>
    </Card>
  );

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const profileQuery = useQuery({
    queryKey: ["profile"],
    queryFn: () => apiFetch<ProfileResponse>("/api/profile"),
    enabled: isOpen,
  });

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: () => apiFetch<SettingsResponse>("/api/settings"),
    enabled: isOpen,
  });

  const orgsQuery = useQuery({
    queryKey: ["orgs"],
    queryFn: () => apiFetch<OrgResponse>("/api/orgs"),
    enabled: isOpen,
  });
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const orgs = orgsQuery.data?.orgs ?? [];
  const selectedOrg = useMemo(
    () => orgs.find((org) => org.id === selectedOrgId) ?? null,
    [orgs, selectedOrgId]
  );

  const workspacesQuery = useQuery({
    queryKey: ["workspaces"],
    queryFn: () => apiFetch<WorkspacesResponse>("/api/workspaces"),
    enabled: isOpen,
  });

  const plansQuery = useQuery({
    queryKey: ["subscription-plans"],
    queryFn: () => apiFetch<PlanResponse>("/api/subscriptions/plans"),
    enabled: isOpen && isAdmin,
  });

  const catalogQuery = useQuery({
    queryKey: ["subscription-catalog"],
    queryFn: () => apiFetch<PlanResponse>("/api/subscriptions/catalog"),
    enabled: isOpen && !isAdmin,
  });

  useEffect(() => {
    if (!plansQuery.data?.plans) return;
    const nextDrafts: Record<string, PlanDraft> = {};
    plansQuery.data.plans.forEach((plan) => {
      nextDrafts[plan.key] = {
        key: plan.key,
        name: plan.name,
        price_monthly: plan.price_monthly,
        features: { ...plan.features },
        limits: { ...plan.limits },
      };
    });
    setPlanDrafts(nextDrafts);
  }, [plansQuery.data?.plans]);

  useEffect(() => {
    if (!isOpen || isAdmin) return;
    if (activeTab === "ai" && !canUseAi) {
      onTabChange("subscription");
    }
    if (activeTab === "integrations" && !canUseIntegrations) {
      onTabChange("subscription");
    }
    if (activeTab === "due_dates" && !canUseDueDates) {
      onTabChange("subscription");
    }
  }, [
    activeTab,
    canUseAi,
    canUseDueDates,
    canUseIntegrations,
    isAdmin,
    isOpen,
    onTabChange,
  ]);

  const orgWorkspacesQueries = useQueries({
    queries: orgs.map((org) => ({
      queryKey: ["org-workspaces", org.id],
      queryFn: () =>
        apiFetch<OrgWorkspacesResponse>(`/api/orgs/${org.id}/workspaces`),
      enabled: isOpen,
    })),
  });

  const personalWorkspaces = useMemo(
    () =>
      (workspacesQuery.data?.workspaces ?? []).filter(
        (workspace) => workspace.type === "personal"
      ),
    [workspacesQuery.data?.workspaces]
  );

  const orgWorkspacesById = useMemo(() => {
    const map: Record<string, OrgWorkspacesResponse["workspaces"]> = {};
    orgs.forEach((org, index) => {
      map[org.id] = orgWorkspacesQueries[index]?.data?.workspaces ?? [];
    });
    return map;
  }, [orgs, orgWorkspacesQueries]);

  const allOrgWorkspaces = useMemo(
    () =>
      orgs.flatMap((org) =>
        (orgWorkspacesById[org.id] ?? []).map((workspace) => ({
          ...workspace,
          orgName: org.name,
        }))
      ),
    [orgs, orgWorkspacesById]
  );

  const personalCategoriesQueries = useQueries({
    queries: personalWorkspaces.map((workspace) => ({
      queryKey: ["workspace-categories", workspace.id],
      queryFn: () =>
        apiFetch<WorkspaceCategoriesResponse>(
          `/api/workspaces/${workspace.id}/categories`
        ),
      enabled: isOpen,
    })),
  });

  const orgCategoriesQueries = useQueries({
    queries: allOrgWorkspaces.map((workspace) => ({
      queryKey: ["workspace-categories", workspace.id],
      queryFn: () =>
        apiFetch<WorkspaceCategoriesResponse>(
          `/api/workspaces/${workspace.id}/categories`
        ),
      enabled: isOpen,
    })),
  });

  const categoriesByWorkspaceId = useMemo(() => {
    const map: Record<string, WorkspaceCategoriesResponse> = {};
    personalWorkspaces.forEach((workspace, index) => {
      const data = personalCategoriesQueries[index]?.data;
      if (data) {
        map[workspace.id] = data;
      }
    });
    allOrgWorkspaces.forEach((workspace, index) => {
      const data = orgCategoriesQueries[index]?.data;
      if (data) {
        map[workspace.id] = data;
      }
    });
    return map;
  }, [
    personalWorkspaces,
    personalCategoriesQueries,
    allOrgWorkspaces,
    orgCategoriesQueries,
  ]);

  const selectedOrgWorkspaces = useMemo(
    () => (selectedOrgId ? orgWorkspacesById[selectedOrgId] ?? [] : []),
    [orgWorkspacesById, selectedOrgId]
  );

  const workspaceMembersQueries = useQueries({
    queries: selectedOrgWorkspaces.map((workspace) => ({
      queryKey: ["workspace-members", workspace.id],
      queryFn: () =>
        apiFetch<WorkspaceMembersResponse>(
          `/api/workspaces/${workspace.id}/members`
        ),
      enabled: isOpen && Boolean(selectedOrgId),
    })),
  });

  const workspaceMembersById = useMemo(() => {
    const map: Record<string, WorkspaceMembersResponse["members"]> = {};
    selectedOrgWorkspaces.forEach((workspace, index) => {
      map[workspace.id] = workspaceMembersQueries[index]?.data?.members ?? [];
    });
    return map;
  }, [selectedOrgWorkspaces, workspaceMembersQueries]);

  useEffect(() => {
    if (!selectedOrgId && orgs.length > 0) {
      setSelectedOrgId(orgs[0].id);
    }
  }, [orgs, selectedOrgId]);

  const membersQuery = useQuery({
    queryKey: ["org-members", selectedOrgId],
    queryFn: () =>
      apiFetch<OrgMembersResponse>(`/api/orgs/${selectedOrgId}/members`),
    enabled: isOpen && Boolean(selectedOrgId),
  });
  const invitesQuery = useQuery({
    queryKey: ["org-invites", selectedOrgId],
    queryFn: () =>
      apiFetch<OrgInvitesResponse>(`/api/orgs/${selectedOrgId}/invites`),
    enabled: isOpen && Boolean(selectedOrgId),
  });
  const pendingInvitesQuery = useQuery({
    queryKey: ["pending-invites"],
    queryFn: () => apiFetch<PendingInvitesResponse>("/api/orgs/invites"),
    enabled: isOpen,
  });

  const orgMembersCount = membersQuery.data?.members?.length ?? 0;
  const orgInvitesCount = invitesQuery.data?.invites?.length ?? 0;
  const orgMemberLimitReached =
    !isAdmin &&
    typeof limits["limit.org_members"] === "number" &&
    orgMembersCount + orgInvitesCount >= limits["limit.org_members"];

  useEffect(() => {
    if (!selectedOrgId) return;
    membersQuery.refetch();
    invitesQuery.refetch();
  }, [selectedOrgId, membersQuery, invitesQuery]);

  const [profileDraft, setProfileDraft] = useState({ name: "", email: "" });
  const [passwordDraft, setPasswordDraft] = useState({
    current: "",
    next: "",
    confirm: "",
  });
  const [profileFeedback, setProfileFeedback] = useState("");

  useEffect(() => {
    if (profileQuery.data?.user) {
      setProfileDraft({
        name: profileQuery.data.user.name,
        email: profileQuery.data.user.email,
      });
    }
  }, [profileQuery.data?.user]);

  const updateProfileMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/profile", {
        method: "PUT",
        body: {
          name: profileDraft.name.trim(),
          email: profileDraft.email.trim(),
        },
      }),
    onSuccess: async () => {
      setProfileFeedback("Profile updated.");
      await profileQuery.refetch();
    },
    onError: (error: Error) => setProfileFeedback(error.message),
  });

  const updatePasswordMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/profile", {
        method: "PUT",
        body: {
          currentPassword: passwordDraft.current,
          newPassword: passwordDraft.next,
        },
      }),
    onSuccess: () => {
      setPasswordDraft({ current: "", next: "", confirm: "" });
      setProfileFeedback("Password updated.");
    },
    onError: (error: Error) => setProfileFeedback(error.message),
  });

  const [settingsDraft, setSettingsDraft] = useState({
    appearance: "light" as "light" | "dark",
    taskAddPosition: "bottom" as "top" | "bottom",
    defaultEstMinutes: 15,
    dueSoonDays: 3,
    aiConfirm: true,
    aiRoutine: "",
    aiWorkHours: "",
    aiPreferences: "",
  });
  const [settingsFeedback, setSettingsFeedback] = useState("");

  useEffect(() => {
    const data = settingsQuery.data?.settings;
    if (!data) return;
    setSettingsDraft({
      appearance: data.appearance,
      taskAddPosition: data.task_add_position,
      defaultEstMinutes: data.default_est_minutes,
      dueSoonDays: data.due_soon_days,
      aiConfirm: Boolean(data.ai_confirm),
      aiRoutine: data.ai_routine ?? "",
      aiWorkHours: data.ai_work_hours ?? "",
      aiPreferences: data.ai_preferences ?? "",
    });
  }, [settingsQuery.data?.settings]);

  const updateSettingsMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      apiFetch("/api/settings", {
        method: "PUT",
        body: payload,
      }),
    onSuccess: async () => {
      setSettingsFeedback("Saved.");
      await queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (error: Error) => setSettingsFeedback(error.message),
  });

  const updatePlanMutation = useMutation({
    mutationFn: (payload: PlanDraft) =>
      apiFetch("/api/subscriptions/plans", {
        method: "PUT",
        body: {
          key: payload.key,
          name: payload.name,
          priceMonthly: payload.price_monthly,
          features: payload.features,
          limits: payload.limits,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["subscription-plans"] });
    },
  });

  const subscribeMutation = useMutation({
    mutationFn: (planKey: "free" | "pro" | "enterprise") =>
      apiFetch("/api/subscriptions/subscribe", {
        method: "POST",
        body: { planKey },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["entitlements"] });
      queryClient.invalidateQueries({ queryKey: ["subscription-catalog"] });
      setShowPlanPicker(false);
    },
  });

  const [categoryDrafts, setCategoryDrafts] = useState<
    Record<string, { name: string; color: string }>
  >({});
  const [editCategoryKey, setEditCategoryKey] = useState<string | null>(null);
  const [editCategoryDraft, setEditCategoryDraft] = useState({
    name: "",
    color: "#64748b",
  });
  const [categoryFeedback, setCategoryFeedback] = useState("");

  const [orgDraft, setOrgDraft] = useState({ name: "", slug: "" });
  const [orgFeedback, setOrgFeedback] = useState("");
  const [workspaceFeedback, setWorkspaceFeedback] = useState("");
  const [personalWorkspaceDraft, setPersonalWorkspaceDraft] = useState("");
  const [orgWorkspaceDrafts, setOrgWorkspaceDrafts] = useState<
    Record<string, string>
  >({});
  const createOrgMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ id?: string }>("/api/orgs", {
        method: "POST",
        body: { name: orgDraft.name, slug: orgDraft.slug || orgDraft.name },
      }),
    onSuccess: (data: { id?: string }) => {
      setOrgDraft({ name: "", slug: "" });
      setOrgFeedback("");
      if (data?.id) {
        setSelectedOrgId(data.id);
      }
      orgsQuery.refetch();
    },
    onError: (error: Error) => setOrgFeedback(error.message),
  });

  const createPersonalWorkspaceMutation = useMutation({
    mutationFn: () =>
      apiFetch("/api/workspaces", {
        method: "POST",
        body: { name: personalWorkspaceDraft, type: "personal" },
      }),
    onSuccess: () => {
      setPersonalWorkspaceDraft("");
      setWorkspaceFeedback("");
      workspacesQuery.refetch();
    },
    onError: (error: Error) => setWorkspaceFeedback(error.message),
  });

  const createOrgWorkspaceMutation = useMutation({
    mutationFn: (payload: { orgId: string; name: string }) =>
      apiFetch(`/api/orgs/${payload.orgId}/workspaces`, {
        method: "POST",
        body: { name: payload.name },
      }),
    onSuccess: () => {
      setWorkspaceFeedback("");
      queryClient.invalidateQueries({ queryKey: ["org-workspaces"] });
    },
    onError: (error: Error) => setWorkspaceFeedback(error.message),
  });

  const deleteWorkspaceMutation = useMutation({
    mutationFn: (payload: { workspaceId: string; transferId?: string }) =>
      apiFetch(`/api/workspaces/${payload.workspaceId}`, {
        method: "DELETE",
        body: payload.transferId
          ? { transferWorkspaceId: payload.transferId }
          : {},
      }),
    onSuccess: async () => {
      setWorkspaceFeedback("");
      await workspacesQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: ["org-workspaces"] });
    },
    onError: (error: Error) => setWorkspaceFeedback(error.message),
  });

  const transferWorkspaceMutation = useMutation({
    mutationFn: (payload: { workspaceId: string; transferId: string }) =>
      apiFetch(`/api/workspaces/${payload.workspaceId}/transfer`, {
        method: "POST",
        body: { transferWorkspaceId: payload.transferId },
      }),
    onSuccess: async () => {
      setWorkspaceFeedback("");
      await workspacesQuery.refetch();
      await queryClient.invalidateQueries({ queryKey: ["org-workspaces"] });
    },
    onError: (error: Error) => setWorkspaceFeedback(error.message),
  });

  const [inviteDraft, setInviteDraft] = useState({
    email: "",
    role: "member" as "owner" | "admin" | "supervisor" | "member",
  });
  const [existingUserRole, setExistingUserRole] = useState<
    "owner" | "admin" | "supervisor" | "member"
  >("member");
  const [joinToken, setJoinToken] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const userSearchQuery = useQuery({
    queryKey: ["user-search", userSearch],
    queryFn: () =>
      apiFetch<UserSearchResponse>(
        `/api/users/search?query=${encodeURIComponent(userSearch)}`
      ),
    enabled: isOpen && userSearch.trim().length >= 2,
  });
  const inviteMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/orgs/${selectedOrgId}/invites`, {
        method: "POST",
        body: inviteDraft,
      }),
    onSuccess: () => {
      setInviteDraft({ email: "", role: "member" });
      invitesQuery.refetch();
    },
    onError: (error: Error) => setOrgFeedback(error.message),
  });

  const acceptInviteMutation = useMutation({
    mutationFn: (token: string) =>
      apiFetch("/api/orgs/invites/accept", {
        method: "POST",
        body: { token },
      }),
    onSuccess: () => {
      setJoinToken("");
      orgsQuery.refetch();
      membersQuery.refetch();
      pendingInvitesQuery.refetch();
    },
    onError: (error: Error) => setOrgFeedback(error.message),
  });

  const addMemberMutation = useMutation({
    mutationFn: (payload: { userId: string; role: string }) =>
      apiFetch(`/api/orgs/${selectedOrgId}/members`, {
        method: "POST",
        body: payload,
      }),
    onSuccess: () => {
      setUserSearch("");
      membersQuery.refetch();
    },
    onError: (error: Error) => setOrgFeedback(error.message),
  });

  const addWorkspaceMemberMutation = useMutation({
    mutationFn: (payload: { workspaceId: string; userId: string }) =>
      apiFetch(`/api/workspaces/${payload.workspaceId}/members`, {
        method: "POST",
        body: { userId: payload.userId, role: "member" },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-members"] });
    },
    onError: (error: Error) => setOrgFeedback(error.message),
  });

  const removeWorkspaceMemberMutation = useMutation({
    mutationFn: (payload: { workspaceId: string; userId: string }) =>
      apiFetch(`/api/workspaces/${payload.workspaceId}/members?userId=${payload.userId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workspace-members"] });
    },
    onError: (error: Error) => setOrgFeedback(error.message),
  });

  const createCategoryMutation = useMutation({
    mutationFn: (payload: { workspaceId: string; name: string; color: string }) =>
      apiFetch(`/api/workspaces/${payload.workspaceId}/categories`, {
        method: "POST",
        body: { name: payload.name, color: payload.color },
      }),
    onSuccess: () => {
      setCategoryFeedback("");
      queryClient.invalidateQueries({ queryKey: ["workspace-categories"] });
    },
    onError: (error: Error) => setCategoryFeedback(error.message),
  });

  const updateCategoryMutation = useMutation({
    mutationFn: (payload: {
      workspaceId: string;
      id: string;
      name: string;
      color: string;
    }) =>
      apiFetch(`/api/workspaces/${payload.workspaceId}/categories`, {
        method: "PUT",
        body: { id: payload.id, name: payload.name, color: payload.color },
      }),
    onSuccess: () => {
      setEditCategoryKey(null);
      setEditCategoryDraft({ name: "", color: "#64748b" });
      setCategoryFeedback("");
      queryClient.invalidateQueries({ queryKey: ["workspace-categories"] });
    },
    onError: (error: Error) => setCategoryFeedback(error.message),
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (payload: { workspaceId: string; id: string }) =>
      apiFetch(`/api/workspaces/${payload.workspaceId}/categories?id=${payload.id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      setCategoryFeedback("");
      queryClient.invalidateQueries({ queryKey: ["workspace-categories"] });
    },
    onError: (error: Error) => setCategoryFeedback(error.message),
  });

  if (!isOpen || !isMounted) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-ink-900/40 p-6 backdrop-blur">
      <div className="absolute inset-0" onClick={onClose} />
      <div
        className="relative h-[90vh] w-[90vw] overflow-hidden rounded-2xl border border-border/70 bg-card shadow-card"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border/70 px-6 py-4">
          <h3 className="text-lg font-display text-foreground">Settings</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="grid h-[calc(90vh-68px)] gap-4 lg:grid-cols-[260px_1fr]">
          <div className="h-full overflow-y-auto border-r border-border/70 bg-muted/60 p-4 text-sm">
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  User settings
                </p>
                <div className="mt-2 space-y-1">
                  <button
                    className={cn(
                      "block w-full rounded-lg px-3 py-2 text-left hover:bg-card",
                      activeTab === "profile" && "bg-card shadow-inset"
                    )}
                    onClick={() => onTabChange("profile")}
                  >
                    Profile
                    <p className="text-xs text-muted-foreground">Account settings</p>
                  </button>
                  <button
                    className={cn(
                      "block w-full rounded-lg px-3 py-2 text-left hover:bg-card",
                      activeTab === "invitations" && "bg-card shadow-inset"
                    )}
                    onClick={() => onTabChange("invitations")}
                  >
                    Invitations
                    <p className="text-xs text-muted-foreground">
                      Join organizations
                    </p>
                  </button>
                  <button
                    className={cn(
                      "block w-full rounded-lg px-3 py-2 text-left hover:bg-card",
                      activeTab === "subscription" && "bg-card shadow-inset"
                    )}
                    onClick={() => onTabChange("subscription")}
                  >
                    Subscription
                  </button>
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Generic
                </p>
                <div className="mt-2 space-y-1">
                  <button
                    className={cn(
                      "block w-full rounded-lg px-3 py-2 text-left hover:bg-card",
                      activeTab === "general" && "bg-card shadow-inset"
                    )}
                    onClick={() => onTabChange("general")}
                  >
                    General settings
                  </button>
                  <button
                    className={cn(
                      "block w-full rounded-lg px-3 py-2 text-left hover:bg-card",
                      activeTab === "workspaces" && "bg-card shadow-inset"
                    )}
                    onClick={() => onTabChange("workspaces")}
                  >
                    Workspaces
                  </button>
                  <button
                    className={cn(
                      "block w-full rounded-lg px-3 py-2 text-left hover:bg-card",
                      activeTab === "organizations" && "bg-card shadow-inset"
                    )}
                    onClick={() => onTabChange("organizations")}
                  >
                    Organizations
                  </button>
                  <button
                    className={cn(
                      "block w-full rounded-lg px-3 py-2 text-left hover:bg-card",
                      activeTab === "categories" && "bg-card shadow-inset"
                    )}
                    onClick={() => onTabChange("categories")}
                  >
                    Categories
                  </button>
                  <button
                    className={cn(
                      "block w-full rounded-lg px-3 py-2 text-left hover:bg-card",
                      activeTab === "integrations" && "bg-card shadow-inset"
                    )}
                    onClick={() => onTabChange("integrations")}
                    disabled={!canUseIntegrations && !isAdmin}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span>Integrations</span>
                      {!canUseIntegrations && !isAdmin && (
                        <Badge variant="outline" className="text-[10px]">
                          Upgrade
                        </Badge>
                      )}
                    </span>
                  </button>
                </div>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                  Supremacy
                </p>
                <div className="mt-2 space-y-1">
                  <button
                    className={cn(
                      "block w-full rounded-lg px-3 py-2 text-left hover:bg-card",
                      activeTab === "ai" && "bg-card shadow-inset"
                    )}
                    onClick={() => onTabChange("ai")}
                    disabled={!canUseAi && !isAdmin}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span>AI Assistant</span>
                      {!canUseAi && !isAdmin && (
                        <Badge variant="outline" className="text-[10px]">
                          Upgrade
                        </Badge>
                      )}
                    </span>
                  </button>
                  <button
                    className={cn(
                      "block w-full rounded-lg px-3 py-2 text-left hover:bg-card",
                      activeTab === "due_dates" && "bg-card shadow-inset"
                    )}
                    onClick={() => onTabChange("due_dates")}
                    disabled={!canUseDueDates && !isAdmin}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span>Due dates</span>
                      {!canUseDueDates && !isAdmin && (
                        <Badge variant="outline" className="text-[10px]">
                          Upgrade
                        </Badge>
                      )}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="h-full overflow-y-auto p-6 text-sm text-muted-foreground">
            {activeTab === "profile" && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-base font-semibold text-foreground">
                    Profile
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Update your account details and manage your password.
                  </p>
                </div>
                {profileFeedback && (
                  <p className="text-sm text-muted-foreground">{profileFeedback}</p>
                )}
                <Card>
                  <CardHeader>
                    <CardTitle>Account</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 lg:grid-cols-[180px_1fr]">
                      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Name
                      </span>
                      <Input
                        value={profileDraft.name}
                        onChange={(event) =>
                          setProfileDraft((prev) => ({
                            ...prev,
                            name: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="grid gap-3 lg:grid-cols-[180px_1fr]">
                      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Email
                      </span>
                      <Input
                        type="email"
                        value={profileDraft.email}
                        onChange={(event) =>
                          setProfileDraft((prev) => ({
                            ...prev,
                            email: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <Button
                      onClick={() => updateProfileMutation.mutate()}
                      disabled={
                        updateProfileMutation.isPending ||
                        !profileDraft.name.trim() ||
                        !profileDraft.email.trim()
                      }
                    >
                      {updateProfileMutation.isPending ? "Saving..." : "Save account"}
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Change password</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 lg:grid-cols-[180px_1fr]">
                      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Current password
                      </span>
                      <Input
                        type="password"
                        value={passwordDraft.current}
                        onChange={(event) =>
                          setPasswordDraft((prev) => ({
                            ...prev,
                            current: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="grid gap-3 lg:grid-cols-[180px_1fr]">
                      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        New password
                      </span>
                      <Input
                        type="password"
                        value={passwordDraft.next}
                        onChange={(event) =>
                          setPasswordDraft((prev) => ({
                            ...prev,
                            next: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="grid gap-3 lg:grid-cols-[180px_1fr]">
                      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Confirm
                      </span>
                      <Input
                        type="password"
                        value={passwordDraft.confirm}
                        onChange={(event) =>
                          setPasswordDraft((prev) => ({
                            ...prev,
                            confirm: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <Button
                      onClick={() => {
                        if (passwordDraft.next !== passwordDraft.confirm) {
                          setProfileFeedback("Passwords do not match.");
                          return;
                        }
                        updatePasswordMutation.mutate();
                      }}
                      disabled={
                        updatePasswordMutation.isPending ||
                        !passwordDraft.current ||
                        !passwordDraft.next
                      }
                    >
                      {updatePasswordMutation.isPending
                        ? "Updating..."
                        : "Update password"}
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Workspaces</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {profileQuery.data?.memberships?.map((membership) => (
                      <div
                        key={membership.workspaceId}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/60 px-3 py-2"
                      >
                        <div>
                          <p className="font-medium text-foreground">
                            {membership.workspaceName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {membership.workspaceType}
                          </p>
                        </div>
                        <Badge variant="outline">{membership.role}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === "subscription" && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-base font-semibold text-foreground">
                    Subscription
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Manage your membership plan and billing.
                  </p>
                </div>
                <Card>
                  <CardHeader>
                    <CardTitle>Current plan</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="rounded-xl border border-border/70 bg-muted/60 p-4">
                      <p className="text-sm font-semibold text-foreground">
                        {entitlementsQuery.data?.entitlements?.planName ?? "Free"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {entitlementsQuery.data?.entitlements?.isAdmin
                          ? "Admin access with all features enabled."
                          : "Plan features and limits apply to your account."}
                      </p>
                    </div>
                    {!isAdmin && (
                      <Button onClick={() => setShowPlanPicker(true)}>
                        Manage plan
                      </Button>
                    )}
                  </CardContent>
                </Card>
                {!isAdmin && showPlanPicker && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Choose a plan</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {catalogQuery.isLoading && (
                        <p className="text-sm text-muted-foreground">
                          Loading plans...
                        </p>
                      )}
                      {catalogQuery.data?.plans?.length ? (
                        (() => {
                          const plans = catalogQuery.data?.plans ?? [];
                          const activeKey =
                            entitlementsQuery.data?.entitlements.planKey ?? "free";
                          const featureKeys = Array.from(
                            new Set(
                              plans.flatMap((plan) => Object.keys(plan.features))
                            )
                          ).sort();
                          const limitKeys = Array.from(
                            new Set(
                              plans.flatMap((plan) => Object.keys(plan.limits))
                            )
                          ).sort();
                          return (
                            <div className="overflow-x-auto rounded-xl border border-border/70">
                              <div
                                className="grid min-w-[520px]"
                                style={{
                                  gridTemplateColumns: `200px repeat(${plans.length}, minmax(140px, 1fr))`,
                                }}
                              >
                                <div className="flex items-center justify-center border-b border-border/70 bg-muted/40 px-3 py-3 text-center text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                  Plan
                                </div>
                                {plans.map((plan) => (
                                  <div
                                    key={plan.key}
                                    className="flex flex-col items-center justify-center border-b border-border/70 bg-muted/40 px-3 py-3 text-center"
                                  >
                                    <p className="text-sm font-semibold text-foreground">
                                      {plan.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      ${plan.price_monthly}/month
                                    </p>
                                  </div>
                                ))}

                                {featureKeys.map((key) => (
                                  <div key={`${key}-row`} className="contents">
                                    <div className="border-b border-border/60 px-3 py-2 text-xs text-muted-foreground">
                                      {formatEntitlementKey(key)}
                                    </div>
                                    {plans.map((plan) => {
                                      const enabled = Boolean(plan.features[key]);
                                      return (
                                        <div
                                          key={`${plan.key}-${key}`}
                                          className="flex items-center justify-center border-b border-border/60 px-3 py-2 text-sm"
                                        >
                                          {enabled ? (
                                            <Check className="h-4 w-4 text-emerald-600" />
                                          ) : (
                                            <Minus className="h-4 w-4 text-muted-foreground" />
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                ))}

                                {limitKeys.map((key) => (
                                  <div key={`${key}-row`} className="contents">
                                    <div className="border-b border-border/60 px-3 py-2 text-xs text-muted-foreground">
                                      {formatEntitlementKey(key)}
                                    </div>
                                    {plans.map((plan) => (
                                      <div
                                        key={`${plan.key}-${key}`}
                                        className="flex items-center justify-center border-b border-border/60 px-3 py-2 text-xs"
                                      >
                                        {plan.limits[key] ?? "-"}
                                      </div>
                                    ))}
                                  </div>
                                ))}

                                <div className="flex items-center justify-center px-3 py-3 text-center text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                  Action
                                </div>
                                {plans.map((plan) => {
                                  const isActive = plan.key === activeKey;
                                  const currentPlan =
                                    plans.find((item) => item.key === activeKey) ??
                                    plan;
                                  const isUpgrade =
                                    plan.price_monthly > currentPlan.price_monthly;
                                  const actionLabel = isActive
                                    ? "Current plan"
                                    : isUpgrade
                                    ? "Upgrade"
                                    : "Downgrade";
                                  return (
                                    <div
                                      key={`${plan.key}-action`}
                                      className="px-3 py-3"
                                    >
                                      <Button
                                        variant={isActive ? "secondary" : "default"}
                                        disabled={
                                          isActive || subscribeMutation.isPending
                                        }
                                        onClick={() =>
                                          subscribeMutation.mutate(plan.key)
                                        }
                                        className="w-full"
                                      >
                                        {actionLabel}
                                      </Button>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()
                      ) : null}
                      <Button
                        variant="ghost"
                        onClick={() => setShowPlanPicker(false)}
                      >
                        Close
                      </Button>
                    </CardContent>
                  </Card>
                )}
                {isAdmin && (
                  <Card>
                    <CardHeader>
                      <CardTitle>Plan management</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {plansQuery.isLoading && (
                        <p className="text-sm text-muted-foreground">
                          Loading plans...
                        </p>
                      )}
                      {!plansQuery.isLoading &&
                        plansQuery.data?.plans?.map((plan) => {
                          const draft = planDrafts[plan.key] ?? plan;
                          return (
                            <div
                              key={plan.key}
                              className="rounded-2xl border border-border/70 bg-muted/40 p-4"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-foreground">
                                    {draft.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    Key: {draft.key}
                                  </p>
                                </div>
                                <Button
                                  onClick={() => updatePlanMutation.mutate(draft)}
                                  disabled={updatePlanMutation.isPending}
                                >
                                  {updatePlanMutation.isPending
                                    ? "Saving..."
                                    : "Save plan"}
                                </Button>
                              </div>
                              <div className="mt-4 grid gap-3 lg:grid-cols-[180px_1fr]">
                                <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                  Name
                                </span>
                                <Input
                                  value={draft.name}
                                  onChange={(event) =>
                                    setPlanDrafts((prev) => ({
                                      ...prev,
                                      [plan.key]: {
                                        ...draft,
                                        name: event.target.value,
                                      },
                                    }))
                                  }
                                />
                              </div>
                              <div className="mt-3 grid gap-3 lg:grid-cols-[180px_1fr]">
                                <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                  Monthly price
                                </span>
                                <Input
                                  type="number"
                                  min={0}
                                  value={draft.price_monthly}
                                  onChange={(event) =>
                                    setPlanDrafts((prev) => ({
                                      ...prev,
                                      [plan.key]: {
                                        ...draft,
                                        price_monthly: Number(event.target.value),
                                      },
                                    }))
                                  }
                                />
                              </div>
                              <div className="mt-4 grid gap-3 lg:grid-cols-[180px_1fr]">
                                <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                  Features
                                </span>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  {Object.entries(draft.features).map(
                                    ([key, value]) => (
                                      <label
                                        key={key}
                                        className="flex items-center gap-2 text-xs text-muted-foreground"
                                      >
                                        <input
                                          type="checkbox"
                                          checked={value}
                                          onChange={(event) =>
                                            setPlanDrafts((prev) => ({
                                              ...prev,
                                              [plan.key]: {
                                                ...draft,
                                                features: {
                                                  ...draft.features,
                                                  [key]: event.target.checked,
                                                },
                                              },
                                            }))
                                          }
                                        />
                                        {formatEntitlementKey(key)}
                                      </label>
                                    )
                                  )}
                                </div>
                              </div>
                              <div className="mt-4 grid gap-3 lg:grid-cols-[180px_1fr]">
                                <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                                  Limits
                                </span>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  {Object.entries(draft.limits).map(
                                    ([key, value]) => (
                                      <label
                                        key={key}
                                        className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2 text-xs"
                                      >
                                        <span className="text-muted-foreground">
                                          {formatEntitlementKey(key)}
                                        </span>
                                        <Input
                                          type="number"
                                          min={0}
                                          value={value}
                                          onChange={(event) =>
                                            setPlanDrafts((prev) => ({
                                              ...prev,
                                              [plan.key]: {
                                                ...draft,
                                                limits: {
                                                  ...draft.limits,
                                                  [key]: Number(event.target.value),
                                                },
                                              },
                                            }))
                                          }
                                          className="h-8 w-24"
                                        />
                                      </label>
                                    )
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {activeTab === "general" && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-base font-semibold text-foreground">
                    General settings
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Control appearance and new task defaults.
                  </p>
                </div>
                {settingsFeedback && (
                  <p className="text-sm text-muted-foreground">{settingsFeedback}</p>
                )}
                <Card>
                  <CardHeader>
                    <CardTitle>Appearance</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
                      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Theme
                      </span>
                      <select
                        className="h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm"
                        value={settingsDraft.appearance}
                        onChange={(event) =>
                          setSettingsDraft((prev) => ({
                            ...prev,
                            appearance: event.target.value as "light" | "dark",
                          }))
                        }
                      >
                        <option value="light">Light</option>
                        <option value="dark">Dark</option>
                      </select>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
                      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Add new task to
                      </span>
                      <select
                        className="h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm"
                        value={settingsDraft.taskAddPosition}
                        onChange={(event) =>
                          setSettingsDraft((prev) => ({
                            ...prev,
                            taskAddPosition: event.target.value as
                              | "top"
                              | "bottom",
                          }))
                        }
                      >
                        <option value="top">Top of list</option>
                        <option value="bottom">Bottom of list</option>
                      </select>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
                      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Default estimate
                      </span>
                      <select
                        className="h-9 rounded-md border border-input bg-card px-3 text-sm shadow-sm"
                        value={settingsDraft.defaultEstMinutes}
                        onChange={(event) =>
                          setSettingsDraft((prev) => ({
                            ...prev,
                            defaultEstMinutes: Number(event.target.value),
                          }))
                        }
                      >
                        {Array.from({ length: 7 }, (_, index) => index * 10).map(
                          (value) => (
                            <option key={value} value={value}>
                              {value} mins
                            </option>
                          )
                        )}
                      </select>
                    </div>
                    <Button
                      onClick={() => {
                        updateSettingsMutation.mutate({
                          appearance: settingsDraft.appearance,
                          taskAddPosition: settingsDraft.taskAddPosition,
                          defaultEstMinutes: settingsDraft.defaultEstMinutes,
                        });
                        applyTheme(settingsDraft.appearance);
                      }}
                      disabled={updateSettingsMutation.isPending}
                    >
                      {updateSettingsMutation.isPending ? "Saving..." : "Save changes"}
                    </Button>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === "invitations" && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-base font-semibold text-foreground">
                    Invitations
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Accept invites to join organizations.
                  </p>
                </div>
                {orgFeedback && (
                  <p className="text-sm text-destructive">{orgFeedback}</p>
                )}
                <Card>
                  <CardHeader>
                    <CardTitle>Pending invitations</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {(pendingInvitesQuery.data?.invites ?? []).map((invite) => (
                      <div
                        key={invite.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-muted/60 px-3 py-2"
                      >
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            {invite.org_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Role: {invite.role}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => acceptInviteMutation.mutate(invite.token)}
                          disabled={acceptInviteMutation.isPending}
                        >
                          {acceptInviteMutation.isPending ? "Accepting..." : "Accept"}
                        </Button>
                      </div>
                    ))}
                    {(pendingInvitesQuery.data?.invites ?? []).length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No pending invitations.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Accept invite token</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Input
                        className="min-w-[220px] flex-1"
                        placeholder="Invite token"
                        value={joinToken}
                        onChange={(event) => setJoinToken(event.target.value)}
                      />
                      <Button
                        onClick={() => acceptInviteMutation.mutate(joinToken)}
                        disabled={!joinToken.trim() || acceptInviteMutation.isPending}
                      >
                        {acceptInviteMutation.isPending ? "Accepting..." : "Accept"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === "workspaces" && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-base font-semibold text-foreground">
                    Workspaces
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Manage personal and organization workspaces.
                  </p>
                </div>
                {workspaceFeedback && (
                  <p className="text-sm text-destructive">{workspaceFeedback}</p>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle>My workspaces</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {personalWorkspaces.map((workspace) => {
                      const transferOptions = personalWorkspaces.filter(
                        (option) => option.id !== workspace.id
                      );
                      return (
                        <div
                          key={workspace.id}
                          className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-2"
                        >
                          <div className="min-w-[160px]">
                            <p className="text-sm font-medium text-foreground">
                              {workspace.name}
                            </p>
                            <p className="text-xs text-muted-foreground">Personal</p>
                          </div>
                          <div className="ml-auto flex items-center gap-2">
                            <Button
                              size="icon"
                              variant="ghost"
                              disabled={
                                deleteWorkspaceMutation.isPending ||
                                transferWorkspaceMutation.isPending
                              }
                              aria-label="Transfer workspace data"
                              onClick={async () => {
                                if (transferOptions.length === 0) {
                                  await Swal.fire({
                                    title: "No transfer targets",
                                    text: "Create another workspace before transferring data.",
                                    icon: "info",
                                  });
                                  return;
                                }
                                const inputOptions = transferOptions.reduce<
                                  Record<string, string>
                                >((acc, option) => {
                                  acc[option.id] = option.name;
                                  return acc;
                                }, {});
                                const result = await Swal.fire({
                                  title: "Transfer data",
                                  text: "Select a workspace to receive this data.",
                                  input: "select",
                                  inputOptions,
                                  inputPlaceholder: "Choose workspace",
                                  showCancelButton: true,
                                  showDenyButton: true,
                                  confirmButtonText: "Transfer & delete",
                                  denyButtonText: "Transfer only",
                                  preConfirm: (value) => {
                                    if (!value) {
                                      Swal.showValidationMessage(
                                        "Select a workspace to continue."
                                      );
                                      return false;
                                    }
                                    return value;
                                  },
                                  preDeny: (value) => {
                                    if (!value) {
                                      Swal.showValidationMessage(
                                        "Select a workspace to continue."
                                      );
                                      return false;
                                    }
                                    return value;
                                  },
                                });
                                if (result.isConfirmed) {
                                  deleteWorkspaceMutation.mutate({
                                    workspaceId: workspace.id,
                                    transferId: result.value as string,
                                  });
                                }
                                if (result.isDenied) {
                                  transferWorkspaceMutation.mutate({
                                    workspaceId: workspace.id,
                                    transferId: result.value as string,
                                  });
                                }
                              }}
                            >
                              <ArrowRightLeft className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              disabled={
                                deleteWorkspaceMutation.isPending ||
                                transferWorkspaceMutation.isPending
                              }
                              aria-label="Delete workspace"
                              onClick={async () => {
                                const result = await Swal.fire({
                                  title: "Delete workspace?",
                                  text: "This will delete the workspace and all of its data.",
                                  icon: "warning",
                                  showCancelButton: true,
                                  confirmButtonText: "Delete",
                                });
                                if (result.isConfirmed) {
                                  deleteWorkspaceMutation.mutate({
                                    workspaceId: workspace.id,
                                  });
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                    {personalWorkspaces.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No personal workspaces yet.
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Input
                        className="min-w-[220px] flex-1"
                        placeholder="New personal workspace"
                        value={personalWorkspaceDraft}
                        onChange={(event) =>
                          setPersonalWorkspaceDraft(event.target.value)
                        }
                      />
                      <Button
                        onClick={() => createPersonalWorkspaceMutation.mutate()}
                        disabled={
                          !personalWorkspaceDraft.trim() ||
                          createPersonalWorkspaceMutation.isPending ||
                          personalWorkspaceLimitReached
                        }
                      >
                        {personalWorkspaceLimitReached ? (
                          <span className="flex items-center gap-2">
                            Upgrade to add
                            <Badge variant="outline" className="text-[10px]">
                              Upgrade
                            </Badge>
                          </span>
                        ) : createPersonalWorkspaceMutation.isPending ? (
                          "Adding..."
                        ) : (
                          "Add workspace"
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {orgs.map((org) => {
                  const orgWorkspaces = orgWorkspacesById[org.id] ?? [];
                  const draft = orgWorkspaceDrafts[org.id] ?? "";
                  const orgWorkspaceLimitReached =
                    !isAdmin &&
                    typeof limits["limit.org_workspaces_per_org"] === "number" &&
                    orgWorkspaces.length >=
                      limits["limit.org_workspaces_per_org"];
                  return (
                    <Card key={org.id}>
                      <CardHeader>
                        <CardTitle>{org.name} workspaces</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {orgWorkspaces.map((workspace) => {
                          const transferOptions = orgWorkspaces.filter(
                            (option) => option.id !== workspace.id
                          );
                          return (
                            <div
                              key={workspace.id}
                              className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-2"
                            >
                              <div className="min-w-[160px]">
                                <p className="text-sm font-medium text-foreground">
                                  {workspace.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {workspace.is_default ? "Default" : "Organization"}
                                </p>
                              </div>
                              <div className="ml-auto flex items-center gap-2">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  disabled={
                                    workspace.is_default === 1 ||
                                    deleteWorkspaceMutation.isPending ||
                                    transferWorkspaceMutation.isPending
                                  }
                                  aria-label="Transfer workspace data"
                                  onClick={async () => {
                                    if (workspace.is_default === 1) return;
                                    if (transferOptions.length === 0) {
                                      await Swal.fire({
                                        title: "No transfer targets",
                                        text: "Create another workspace before transferring data.",
                                        icon: "info",
                                      });
                                      return;
                                    }
                                    const inputOptions = transferOptions.reduce<
                                      Record<string, string>
                                    >((acc, option) => {
                                      acc[option.id] = option.name;
                                      return acc;
                                    }, {});
                                    const result = await Swal.fire({
                                      title: "Transfer data",
                                      text: "Select a workspace to receive this data.",
                                      input: "select",
                                      inputOptions,
                                      inputPlaceholder: "Choose workspace",
                                      showCancelButton: true,
                                      showDenyButton: true,
                                      confirmButtonText: "Transfer & delete",
                                      denyButtonText: "Transfer only",
                                      preConfirm: (value) => {
                                        if (!value) {
                                          Swal.showValidationMessage(
                                            "Select a workspace to continue."
                                          );
                                          return false;
                                        }
                                        return value;
                                      },
                                      preDeny: (value) => {
                                        if (!value) {
                                          Swal.showValidationMessage(
                                            "Select a workspace to continue."
                                          );
                                          return false;
                                        }
                                        return value;
                                      },
                                    });
                                    if (result.isConfirmed) {
                                      deleteWorkspaceMutation.mutate({
                                        workspaceId: workspace.id,
                                        transferId: result.value as string,
                                      });
                                    }
                                    if (result.isDenied) {
                                      transferWorkspaceMutation.mutate({
                                        workspaceId: workspace.id,
                                        transferId: result.value as string,
                                      });
                                    }
                                  }}
                                >
                                  <ArrowRightLeft className="h-4 w-4" />
                                </Button>
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    disabled={
                                      workspace.is_default === 1 ||
                                      deleteWorkspaceMutation.isPending ||
                                      transferWorkspaceMutation.isPending
                                    }
                                    aria-label="Delete workspace"
                                    onClick={async () => {
                                      if (workspace.is_default === 1) return;
                                      const result = await Swal.fire({
                                        title: "Delete workspace?",
                                        text: "This will delete the workspace and all of its data.",
                                        icon: "warning",
                                        showCancelButton: true,
                                        confirmButtonText: "Delete",
                                      });
                                    if (result.isConfirmed) {
                                      deleteWorkspaceMutation.mutate({
                                        workspaceId: workspace.id,
                                      });
                                    }
                                  }}
                                >
                                  <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                        {orgWorkspaces.length === 0 && (
                          <p className="text-sm text-muted-foreground">
                            No workspaces yet.
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Input
                            className="min-w-[220px] flex-1"
                            placeholder={`New workspace for ${org.name}`}
                            value={draft}
                            onChange={(event) =>
                              setOrgWorkspaceDrafts((prev) => ({
                                ...prev,
                                [org.id]: event.target.value,
                              }))
                            }
                          />
                          <Button
                            onClick={() =>
                              createOrgWorkspaceMutation.mutate(
                                { orgId: org.id, name: draft },
                                {
                                  onSuccess: () =>
                                    setOrgWorkspaceDrafts((prev) => ({
                                      ...prev,
                                      [org.id]: "",
                                    })),
                                }
                              )
                            }
                            disabled={
                              !draft.trim() ||
                              createOrgWorkspaceMutation.isPending ||
                              orgWorkspaceLimitReached
                            }
                          >
                            {orgWorkspaceLimitReached ? (
                              <span className="flex items-center gap-2">
                                Upgrade to add
                                <Badge variant="outline" className="text-[10px]">
                                  Upgrade
                                </Badge>
                              </span>
                            ) : createOrgWorkspaceMutation.isPending ? (
                              "Adding..."
                            ) : (
                              "Add workspace"
                            )}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
                {orgs.length === 0 && (
                  <Card>
                    <CardContent className="p-6 text-sm text-muted-foreground">
                      Create an organization to manage shared workspaces.
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {activeTab === "organizations" && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-base font-semibold text-foreground">
                    Organizations
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Create organizations and manage invites.
                  </p>
                </div>
                {orgFeedback && (
                  <p className="text-sm text-destructive">{orgFeedback}</p>
                )}
                <Card>
                  <CardHeader>
                    <CardTitle>Create organization</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 lg:grid-cols-[180px_1fr]">
                      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Name
                      </span>
                      <Input
                        value={orgDraft.name}
                        onChange={(event) =>
                          setOrgDraft((prev) => ({
                            ...prev,
                            name: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <div className="grid gap-3 lg:grid-cols-[180px_1fr]">
                      <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                        Slug
                      </span>
                      <Input
                        value={orgDraft.slug}
                        onChange={(event) =>
                          setOrgDraft((prev) => ({
                            ...prev,
                            slug: event.target.value,
                          }))
                        }
                        placeholder="optional"
                      />
                    </div>
                    <Button
                      onClick={() => createOrgMutation.mutate()}
                      disabled={
                        !orgDraft.name.trim() ||
                        createOrgMutation.isPending ||
                        orgLimitReached
                      }
                    >
                      {orgLimitReached ? (
                        <span className="flex items-center gap-2">
                          Upgrade to add org
                          <Badge variant="outline" className="text-[10px]">
                            Upgrade
                          </Badge>
                        </span>
                      ) : createOrgMutation.isPending ? (
                        "Creating..."
                      ) : (
                        "Create organization"
                      )}
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Your organizations</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid gap-3 lg:grid-cols-[200px_1fr]">
                      <div className="space-y-2">
                        {orgs.map((org) => (
                          <button
                            key={org.id}
                            className={cn(
                              "w-full rounded-lg border border-border/70 px-3 py-2 text-left text-sm",
                              selectedOrgId === org.id
                                ? "bg-muted/60 shadow-inset"
                                : "bg-card hover:bg-muted/40"
                            )}
                            onClick={() => setSelectedOrgId(org.id)}
                          >
                            <p className="font-medium text-foreground">{org.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {org.slug} · {org.role}
                            </p>
                          </button>
                        ))}
                        {orgs.length === 0 && (
                          <p className="text-sm text-muted-foreground">
                            No organizations yet.
                          </p>
                        )}
                      </div>
                      <div className="space-y-3" key={selectedOrgId ?? "none"}>
                        {selectedOrgId ? (
                          <div className="rounded-xl border border-border/70 bg-card p-3">
                            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                              Selected organization
                            </p>
                            <div className="mt-2 space-y-1">
                              <p className="text-sm font-semibold text-foreground">
                                {selectedOrg?.name ?? "Organization"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {selectedOrg?.slug ?? "no-slug"} ·{" "}
                                {selectedOrg?.role ?? "member"}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-xl border border-border/70 bg-card p-3">
                            <p className="text-xs text-muted-foreground">
                              Select an organization to manage details.
                            </p>
                          </div>
                        )}

                        <div className="rounded-xl border border-border/70 bg-card p-3">
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                            Members
                          </p>
                          <div className="mt-2 space-y-2">
                            {(membersQuery.data?.members ?? []).map((member) => (
                              <div
                                key={member.id}
                                className="flex items-center justify-between text-xs text-muted-foreground"
                                draggable
                                onDragStart={(event) => {
                                  event.dataTransfer.setData(
                                    "text/user-id",
                                    member.user_id
                                  );
                                }}
                              >
                                <span>{member.name}</span>
                                <span>{member.role}</span>
                              </div>
                            ))}
                            {selectedOrgId &&
                              (membersQuery.data?.members?.length ?? 0) === 0 && (
                                <p className="text-xs text-muted-foreground">
                                  No members yet.
                                </p>
                              )}
                          </div>
                        </div>

                        <div className="rounded-xl border border-border/70 bg-card p-3">
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                            Workspaces
                          </p>
                          <div className="mt-2 space-y-3">
                            {selectedOrgWorkspaces.map((workspace) => {
                              const workspaceMembers =
                                workspaceMembersById[workspace.id] ?? [];
                              return (
                                <div
                                  key={workspace.id}
                                  className="rounded-lg border border-border/70 bg-muted/40 p-3"
                                  onDragOver={(event) => event.preventDefault()}
                                  onDrop={(event) => {
                                    event.preventDefault();
                                    const userId = event.dataTransfer.getData(
                                      "text/user-id"
                                    );
                                    if (userId) {
                                      addWorkspaceMemberMutation.mutate({
                                        workspaceId: workspace.id,
                                        userId,
                                      });
                                    }
                                  }}
                                >
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="text-sm font-semibold text-foreground">
                                        {workspace.name}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        Drop member here to add
                                      </p>
                                    </div>
                                    {workspace.is_default === 1 && (
                                      <Badge variant="outline">Default</Badge>
                                    )}
                                  </div>
                                  <div className="mt-2 space-y-2">
                                    {workspaceMembers.map((member) => (
                                      <div
                                        key={member.id}
                                        className="flex items-center justify-between text-xs text-muted-foreground"
                                      >
                                        <span>{member.name}</span>
                                        <Button
                                          size="icon"
                                          variant="ghost"
                                          onClick={() =>
                                            removeWorkspaceMemberMutation.mutate({
                                              workspaceId: workspace.id,
                                              userId: member.user_id,
                                            })
                                          }
                                          disabled={removeWorkspaceMemberMutation.isPending}
                                          aria-label="Remove workspace member"
                                        >
                                          <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                      </div>
                                    ))}
                                    {workspaceMembers.length === 0 && (
                                      <p className="text-xs text-muted-foreground">
                                        No members yet.
                                      </p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                            {selectedOrgWorkspaces.length === 0 && (
                              <p className="text-xs text-muted-foreground">
                                No workspaces created yet.
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="rounded-xl border border-border/70 bg-card p-3">
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                            Add existing user
                          </p>
                          <div className="mt-2 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <Input
                                className="min-w-[220px] flex-1"
                                placeholder="Search name or email"
                                value={userSearch}
                                onChange={(event) => setUserSearch(event.target.value)}
                              />
                              <select
                                className="h-9 min-w-[160px] rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                                value={existingUserRole}
                                onChange={(event) =>
                                  setExistingUserRole(
                                    event.target.value as
                                      | "owner"
                                      | "admin"
                                      | "supervisor"
                                      | "member"
                                  )
                                }
                              >
                                <option value="member">Member</option>
                                <option value="supervisor">Supervisor</option>
                                <option value="admin">Admin</option>
                                <option value="owner">Owner</option>
                              </select>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Role defines their permissions inside this organization.
                            </p>
                            <div className="space-y-2">
                              {userSearch.trim().length >= 2 &&
                                (userSearchQuery.data?.users ?? []).map((user) => (
                                  <div
                                    key={user.id}
                                    className="flex items-center justify-between gap-2 text-xs text-muted-foreground"
                                  >
                                    <div>
                                      <p className="text-sm text-foreground">
                                        {user.name}
                                      </p>
                                      <p className="text-xs text-muted-foreground">
                                        {user.email}
                                      </p>
                                    </div>
                                    <Button
                                      size="sm"
                                      onClick={() =>
                                        addMemberMutation.mutate({
                                          userId: user.id,
                                          role: existingUserRole,
                                        })
                                      }
                                      disabled={
                                        !selectedOrgId ||
                                        addMemberMutation.isPending ||
                                        orgMemberLimitReached
                                      }
                                    >
                                      {orgMemberLimitReached ? (
                                        <span className="flex items-center gap-2">
                                          Upgrade
                                          <Badge variant="outline" className="text-[10px]">
                                            Upgrade
                                          </Badge>
                                        </span>
                                      ) : addMemberMutation.isPending ? (
                                        "Adding..."
                                      ) : (
                                        "Add"
                                      )}
                                    </Button>
                                  </div>
                                ))}
                              {userSearch.trim().length >= 2 &&
                                (userSearchQuery.data?.users ?? []).length === 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    No matches.
                                  </p>
                                )}
                            </div>
                          </div>
                        </div>

                        <div className="rounded-xl border border-border/70 bg-card p-3">
                          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                            Invite by email
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Input
                              className="min-w-[200px] flex-1"
                              placeholder="Email address"
                              value={inviteDraft.email}
                              onChange={(event) =>
                                setInviteDraft((prev) => ({
                                  ...prev,
                                  email: event.target.value,
                                }))
                              }
                            />
                            <select
                              className="h-9 min-w-[140px] rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                              value={inviteDraft.role}
                              onChange={(event) =>
                                setInviteDraft((prev) => ({
                                  ...prev,
                                  role: event.target.value as
                                    | "owner"
                                    | "admin"
                                    | "supervisor"
                                    | "member",
                                }))
                              }
                            >
                              <option value="member">Member</option>
                              <option value="supervisor">Supervisor</option>
                              <option value="admin">Admin</option>
                              <option value="owner">Owner</option>
                            </select>
                            <Button
                              onClick={() => inviteMutation.mutate()}
                              disabled={
                                !selectedOrgId ||
                                !inviteDraft.email.trim() ||
                                inviteMutation.isPending ||
                                orgMemberLimitReached
                              }
                            >
                              {orgMemberLimitReached ? (
                                <span className="flex items-center gap-2">
                                  Upgrade
                                  <Badge variant="outline" className="text-[10px]">
                                    Upgrade
                                  </Badge>
                                </span>
                              ) : inviteMutation.isPending ? (
                                "Sending..."
                              ) : (
                                "Send invite"
                              )}
                            </Button>
                          </div>
                          <div className="mt-3 space-y-2">
                            {(invitesQuery.data?.invites ?? []).map((invite) => (
                              <div
                                key={invite.id}
                                className="space-y-1 rounded-lg border border-border/70 bg-muted/40 px-2 py-2 text-xs text-muted-foreground"
                              >
                                <div className="flex items-center justify-between">
                                  <span>{invite.email}</span>
                                  <span>{invite.role}</span>
                                </div>
                                <div className="font-mono text-[10px] text-muted-foreground">
                                  {invite.token}
                                </div>
                              </div>
                            ))}
                            {selectedOrgId &&
                              (invitesQuery.data?.invites?.length ?? 0) === 0 && (
                                <p className="text-xs text-muted-foreground">
                                  No pending invites.
                                </p>
                              )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === "categories" && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-base font-semibold text-foreground">
                    Categories
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Admins and supervisors can manage task categories.
                  </p>
                </div>
                {categoryFeedback && (
                  <p className="text-sm text-destructive">{categoryFeedback}</p>
                )}
                <Card>
                  <CardHeader>
                    <CardTitle>Personal categories</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {personalWorkspaces.map((workspace) => {
                      const categoryData = categoriesByWorkspaceId[workspace.id];
                      const categories =
                        categoryData?.categories?.slice().sort((a, b) =>
                          a.name.localeCompare(b.name)
                        ) ?? [];
                      const categoriesLimitReached =
                        !isAdmin &&
                        typeof limits["limit.categories_per_workspace"] === "number" &&
                        categories.length >= limits["limit.categories_per_workspace"];
                      const role = categoryData?.role ?? "member";
                      const draft = categoryDrafts[workspace.id] ?? {
                        name: "",
                        color: "#64748b",
                      };
                      return (
                        <div key={workspace.id} className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-semibold text-foreground">
                                {workspace.name}
                              </p>
                              <p className="text-xs text-muted-foreground">Personal</p>
                            </div>
                            {role === "member" && (
                              <p className="text-xs text-muted-foreground">
                                View only
                              </p>
                            )}
                          </div>
                          <div className="space-y-2">
                            {categories.map((category) => {
                              const key = `${workspace.id}:${category.id}`;
                              const isEditing = editCategoryKey === key;
                              return (
                                <div
                                  key={category.id}
                                  className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-2"
                                >
                                  {isEditing ? (
                                    <>
                                      <Input
                                        className="min-w-[180px] flex-1"
                                        value={editCategoryDraft.name}
                                        onChange={(event) =>
                                          setEditCategoryDraft((prev) => ({
                                            ...prev,
                                            name: event.target.value,
                                          }))
                                        }
                                      />
                                      <Input
                                        type="color"
                                        className="h-9 w-12 p-1"
                                        value={editCategoryDraft.color}
                                        onChange={(event) =>
                                          setEditCategoryDraft((prev) => ({
                                            ...prev,
                                            color: event.target.value,
                                          }))
                                        }
                                      />
                                    </>
                                  ) : (
                                    <>
                                      <span
                                        className="h-2 w-2 rounded-full"
                                        style={{ backgroundColor: category.color }}
                                      />
                                      <span className="text-sm text-foreground">
                                        {category.name}
                                      </span>
                                      <Badge variant="outline" className="text-[10px]">
                                        {category.color}
                                      </Badge>
                                    </>
                                  )}
                                  {role !== "member" && (
                                    <div className="ml-auto flex items-center gap-2">
                                      {isEditing ? (
                                        <>
                                          <Button
                                            size="sm"
                                            onClick={() =>
                                              updateCategoryMutation.mutate({
                                                workspaceId: workspace.id,
                                                id: category.id,
                                                name: editCategoryDraft.name.trim(),
                                                color: editCategoryDraft.color,
                                              })
                                            }
                                            disabled={
                                              !editCategoryDraft.name.trim() ||
                                              updateCategoryMutation.isPending
                                            }
                                          >
                                            {updateCategoryMutation.isPending
                                              ? "Saving..."
                                              : "Save"}
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                              setEditCategoryKey(null);
                                              setEditCategoryDraft({
                                                name: "",
                                                color: "#64748b",
                                              });
                                              setCategoryFeedback("");
                                            }}
                                          >
                                            Cancel
                                          </Button>
                                        </>
                                      ) : (
                                        <>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                              setEditCategoryKey(key);
                                              setEditCategoryDraft({
                                                name: category.name,
                                                color: category.color,
                                              });
                                              setCategoryFeedback("");
                                            }}
                                          >
                                            Edit
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() =>
                                              deleteCategoryMutation.mutate({
                                                workspaceId: workspace.id,
                                                id: category.id,
                                              })
                                            }
                                            disabled={deleteCategoryMutation.isPending}
                                          >
                                            {deleteCategoryMutation.isPending
                                              ? "Deleting..."
                                              : "Delete"}
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {categories.length === 0 && (
                              <p className="text-sm text-muted-foreground">
                                No categories yet.
                              </p>
                            )}
                          </div>
                          {role !== "member" && (
                            <div className="flex flex-wrap gap-2">
                              <Input
                                className="min-w-[220px] flex-1"
                                placeholder="Add category"
                                value={draft.name}
                                onChange={(event) =>
                                  setCategoryDrafts((prev) => ({
                                    ...prev,
                                    [workspace.id]: {
                                      ...draft,
                                      name: event.target.value,
                                    },
                                  }))
                                }
                              />
                              <Input
                                type="color"
                                className="h-9 w-12 p-1"
                                value={draft.color}
                                onChange={(event) =>
                                  setCategoryDrafts((prev) => ({
                                    ...prev,
                                    [workspace.id]: {
                                      ...draft,
                                      color: event.target.value,
                                    },
                                  }))
                                }
                                title="Pick a color"
                              />
                              <Button
                                onClick={() =>
                                  createCategoryMutation.mutate({
                                    workspaceId: workspace.id,
                                    name: draft.name.trim(),
                                    color: draft.color,
                                  })
                                }
                                disabled={
                                  !draft.name.trim() ||
                                  createCategoryMutation.isPending ||
                                  categoriesLimitReached
                                }
                              >
                                {categoriesLimitReached ? (
                                  <span className="flex items-center gap-2">
                                    Upgrade to add
                                    <Badge variant="outline" className="text-[10px]">
                                      Upgrade
                                    </Badge>
                                  </span>
                                ) : createCategoryMutation.isPending ? (
                                  "Adding..."
                                ) : (
                                  "Add category"
                                )}
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {personalWorkspaces.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No personal workspaces found.
                      </p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Organization categories</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {allOrgWorkspaces.map((workspace) => {
                      const categoryData = categoriesByWorkspaceId[workspace.id];
                      const categories =
                        categoryData?.categories?.slice().sort((a, b) =>
                          a.name.localeCompare(b.name)
                        ) ?? [];
                      const categoriesLimitReached =
                        !isAdmin &&
                        typeof limits["limit.categories_per_workspace"] === "number" &&
                        categories.length >= limits["limit.categories_per_workspace"];
                      const role = categoryData?.role ?? "member";
                      const draft = categoryDrafts[workspace.id] ?? {
                        name: "",
                        color: "#64748b",
                      };
                      return (
                        <div key={workspace.id} className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-semibold text-foreground">
                                {workspace.orgName} · {workspace.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {workspace.is_default ? "Default" : "Workspace"}
                              </p>
                            </div>
                            {role === "member" && (
                              <p className="text-xs text-muted-foreground">
                                View only
                              </p>
                            )}
                          </div>
                          <div className="space-y-2">
                            {categories.map((category) => {
                              const key = `${workspace.id}:${category.id}`;
                              const isEditing = editCategoryKey === key;
                              return (
                                <div
                                  key={category.id}
                                  className="flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-card px-3 py-2"
                                >
                                  {isEditing ? (
                                    <>
                                      <Input
                                        className="min-w-[180px] flex-1"
                                        value={editCategoryDraft.name}
                                        onChange={(event) =>
                                          setEditCategoryDraft((prev) => ({
                                            ...prev,
                                            name: event.target.value,
                                          }))
                                        }
                                      />
                                      <Input
                                        type="color"
                                        className="h-9 w-12 p-1"
                                        value={editCategoryDraft.color}
                                        onChange={(event) =>
                                          setEditCategoryDraft((prev) => ({
                                            ...prev,
                                            color: event.target.value,
                                          }))
                                        }
                                      />
                                    </>
                                  ) : (
                                    <>
                                      <span
                                        className="h-2 w-2 rounded-full"
                                        style={{ backgroundColor: category.color }}
                                      />
                                      <span className="text-sm text-foreground">
                                        {category.name}
                                      </span>
                                      <Badge variant="outline" className="text-[10px]">
                                        {category.color}
                                      </Badge>
                                    </>
                                  )}
                                  {role !== "member" && (
                                    <div className="ml-auto flex items-center gap-2">
                                      {isEditing ? (
                                        <>
                                          <Button
                                            size="sm"
                                            onClick={() =>
                                              updateCategoryMutation.mutate({
                                                workspaceId: workspace.id,
                                                id: category.id,
                                                name: editCategoryDraft.name.trim(),
                                                color: editCategoryDraft.color,
                                              })
                                            }
                                            disabled={
                                              !editCategoryDraft.name.trim() ||
                                              updateCategoryMutation.isPending
                                            }
                                          >
                                            {updateCategoryMutation.isPending
                                              ? "Saving..."
                                              : "Save"}
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                              setEditCategoryKey(null);
                                              setEditCategoryDraft({
                                                name: "",
                                                color: "#64748b",
                                              });
                                              setCategoryFeedback("");
                                            }}
                                          >
                                            Cancel
                                          </Button>
                                        </>
                                      ) : (
                                        <>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                              setEditCategoryKey(key);
                                              setEditCategoryDraft({
                                                name: category.name,
                                                color: category.color,
                                              });
                                              setCategoryFeedback("");
                                            }}
                                          >
                                            Edit
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() =>
                                              deleteCategoryMutation.mutate({
                                                workspaceId: workspace.id,
                                                id: category.id,
                                              })
                                            }
                                            disabled={deleteCategoryMutation.isPending}
                                          >
                                            {deleteCategoryMutation.isPending
                                              ? "Deleting..."
                                              : "Delete"}
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {categories.length === 0 && (
                              <p className="text-sm text-muted-foreground">
                                No categories yet.
                              </p>
                            )}
                          </div>
                          {role !== "member" && (
                            <div className="flex flex-wrap gap-2">
                              <Input
                                className="min-w-[220px] flex-1"
                                placeholder="Add category"
                                value={draft.name}
                                onChange={(event) =>
                                  setCategoryDrafts((prev) => ({
                                    ...prev,
                                    [workspace.id]: {
                                      ...draft,
                                      name: event.target.value,
                                    },
                                  }))
                                }
                              />
                              <Input
                                type="color"
                                className="h-9 w-12 p-1"
                                value={draft.color}
                                onChange={(event) =>
                                  setCategoryDrafts((prev) => ({
                                    ...prev,
                                    [workspace.id]: {
                                      ...draft,
                                      color: event.target.value,
                                    },
                                  }))
                                }
                                title="Pick a color"
                              />
                              <Button
                                onClick={() =>
                                  createCategoryMutation.mutate({
                                    workspaceId: workspace.id,
                                    name: draft.name.trim(),
                                    color: draft.color,
                                  })
                                }
                                disabled={
                                  !draft.name.trim() ||
                                  createCategoryMutation.isPending ||
                                  categoriesLimitReached
                                }
                              >
                                {categoriesLimitReached ? (
                                  <span className="flex items-center gap-2">
                                    Upgrade to add
                                    <Badge variant="outline" className="text-[10px]">
                                      Upgrade
                                    </Badge>
                                  </span>
                                ) : createCategoryMutation.isPending ? (
                                  "Adding..."
                                ) : (
                                  "Add category"
                                )}
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {allOrgWorkspaces.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        No organization workspaces yet.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === "integrations" && (
              <>
                {(!canUseIntegrations && !isAdmin) ? (
                  <UpgradeNotice featureLabel="Integrations" />
                ) : (
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-base font-semibold text-foreground">
                        Integrations
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        Future use. Connect external tools here when available.
                      </p>
                    </div>
                    <Card>
                      <CardContent className="p-6 text-sm text-muted-foreground">
                        Integrations are coming soon.
                      </CardContent>
                    </Card>
                  </div>
                )}
              </>
            )}

            {activeTab === "ai" && (
              <>
                {(!canUseAi && !isAdmin) ? (
                  <UpgradeNotice featureLabel="AI Assistant" />
                ) : (
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-base font-semibold text-foreground">
                        AI Assistant
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        Configure how the assistant helps with scheduling.
                      </p>
                    </div>
                    {settingsFeedback && (
                      <p className="text-sm text-muted-foreground">
                        {settingsFeedback}
                      </p>
                    )}
                    <Card>
                      <CardHeader>
                        <CardTitle>Preferences</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                          <input
                            type="checkbox"
                            checked={settingsDraft.aiConfirm}
                            onChange={(event) =>
                              setSettingsDraft((prev) => ({
                                ...prev,
                                aiConfirm: event.target.checked,
                              }))
                            }
                          />
                          Require confirmation before modifying data
                        </label>
                        <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
                          <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                            Daily routine
                          </span>
                          <Textarea
                            value={settingsDraft.aiRoutine}
                            onChange={(event) =>
                              setSettingsDraft((prev) => ({
                                ...prev,
                                aiRoutine: event.target.value,
                              }))
                            }
                            placeholder="Describe your daily routine."
                          />
                        </div>
                        <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
                          <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                            Preferred work hours
                          </span>
                          <Input
                            value={settingsDraft.aiWorkHours}
                            onChange={(event) =>
                              setSettingsDraft((prev) => ({
                                ...prev,
                                aiWorkHours: event.target.value,
                              }))
                            }
                            placeholder="e.g. 9:00-17:00"
                          />
                        </div>
                        <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
                          <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                            Scheduling preferences
                          </span>
                          <Textarea
                            value={settingsDraft.aiPreferences}
                            onChange={(event) =>
                              setSettingsDraft((prev) => ({
                                ...prev,
                                aiPreferences: event.target.value,
                              }))
                            }
                            placeholder="Preferences for how tasks should be arranged."
                          />
                        </div>
                        <Button
                          onClick={() =>
                            updateSettingsMutation.mutate({
                              aiConfirm: settingsDraft.aiConfirm,
                              aiRoutine: settingsDraft.aiRoutine,
                              aiWorkHours: settingsDraft.aiWorkHours,
                              aiPreferences: settingsDraft.aiPreferences,
                            })
                          }
                          disabled={updateSettingsMutation.isPending}
                        >
                          {updateSettingsMutation.isPending
                            ? "Saving..."
                            : "Save AI settings"}
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </>
            )}

            {activeTab === "due_dates" && (
              <>
                {(!canUseDueDates && !isAdmin) ? (
                  <UpgradeNotice featureLabel="Due dates" />
                ) : (
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-base font-semibold text-foreground">
                        Due dates
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        Control when tasks show a due-soon indicator.
                      </p>
                    </div>
                    {settingsFeedback && (
                      <p className="text-sm text-muted-foreground">
                        {settingsFeedback}
                      </p>
                    )}
                    <Card>
                      <CardHeader>
                        <CardTitle>Due soon indicator</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
                          <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                            Window (days)
                          </span>
                          <Input
                            type="number"
                            min={1}
                            max={30}
                            value={settingsDraft.dueSoonDays}
                            onChange={(event) =>
                              setSettingsDraft((prev) => ({
                                ...prev,
                                dueSoonDays: Number(event.target.value),
                              }))
                            }
                          />
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Tasks due within this window will show a badge in task
                          lists.
                        </p>
                        <Button
                          onClick={() =>
                            updateSettingsMutation.mutate({
                              dueSoonDays: settingsDraft.dueSoonDays,
                            })
                          }
                          disabled={updateSettingsMutation.isPending}
                        >
                          {updateSettingsMutation.isPending
                            ? "Saving..."
                            : "Save due date settings"}
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
