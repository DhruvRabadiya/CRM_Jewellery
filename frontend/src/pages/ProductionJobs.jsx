import React, { useState, useEffect, useCallback } from "react";
import {
  Hammer,
  PlusCircle,
  PlayCircle,
  ArrowRightCircle,
  CheckCircle,
  Calculator,
  AlertTriangle,
  Hash,
  ArrowDownLeft,
  Scale,
  Search,
  Eye,
  Trash2,
  Edit,
} from "lucide-react";
import {
  getCombinedProcesses,
  createProcess,
  startProcess,
  completeProcess,
  getNextJobId,
  editProcess,
  deleteProcess,
  revertProcess,
} from "../api/jobService";
import Modal from "../components/Modal";
import Toast from "../components/Toast";
import ConfirmModal from "../components/ConfirmModal";
import { formatWeight } from "../utils/formatHelpers";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const sizeOptions = {
  Gold: [
    "0.05gm",
    "0.100gm",
    "0.250gm",
    "0.500gm",
    "1 gm",
    "2 gm",
    "5 gm",
    "10 gm",
    "20 gm",
    "25 gm",
    "50 gm",
    "100 gm",
    "Mix",
    "Other",
  ],
  Silver: [
    "1g -Bar",
    "2g -Bar",
    "5g C|B",
    "10g -C|B",
    "10g COLOUR",
    "20g COLOUR",
    "50g COLOUR",
    "20g -C|B",
    "25g-C|B",
    "50g -C|B",
    "100g -C|B",
    "200g -Bar",
    "250 gm",
    "500 gm",
    "Mix",
    "Other",
  ],
};

const stages = ["Melting", "Rolling", "Press", "TPP", "Packing"];

const formatCategoryDisplay = (categories, customCategory) => {
  if (!categories || categories.length === 0) return "Select categories...";
  const standard = categories.filter(c => c !== "Other");
  const custom = categories.includes("Other") && customCategory ? customCategory : "";
  const parts = [...standard];
  if (custom) parts.push(custom);
  return parts.join(", ");
};

const ProductionJobs = () => {
  const [processes, setProcesses] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [isShaking, setIsShaking] = useState(false);
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    isDestructive: false,
    confirmText: "Confirm",
  });
  const navigate = useNavigate();

  const { user, isAdmin } = useAuth();

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isStartModalOpen, setIsStartModalOpen] = useState(false);
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [selectedProcess, setSelectedProcess] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: "job_number", direction: "asc" });
  const [activeTab, setActiveTab] = useState("incomplete");
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  const [createForm, setCreateForm] = useState({
    stage: "",
    job_number: "",
    metal_type: "",
    categories: [],
    customCategory: "",
    issue_size: "",
    issue_pieces: "",
    job_name: "",
    weight_unit: "g",
    description: "",
    employee: "",
  });

  const [startForm, setStartForm] = useState({
    issued_weight: "",
    issue_pieces: "",
    weight_unit: "g",
    description: "",
    employee: "",
  });
  const [completeForm, setCompleteForm] = useState({
    return_items: [{ category: "", return_weight: "", return_pieces: "" }],
    scrap_weight: "",
    weight_unit: "g",
    description: "",
  });
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    issued_weight: "",
    weight_unit: "g",
    description: "",
    categories: [],
    customCategory: "",
    return_items: [{ category: "", return_weight: "", return_pieces: "" }],
    scrap_weight: "",
  });

  const showToast = (message, type) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };
  const triggerError = () => {
    setIsShaking(true);
    setTimeout(() => setIsShaking(false), 500);
  };

  const fetchProcesses = useCallback(async () => {
    try {
      const result = await getCombinedProcesses();
      if (result.success) setProcesses(result.data);
    } catch (error) {
      showToast("Failed to load processes", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  const [users, setUsers] = useState([]);

  useEffect(() => {
    fetchProcesses();
    const fetchUsers = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(
          `${import.meta.env.VITE_API_URL || "http://localhost:3000/api"}/auth/users`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );
        const data = await res.json();
        if (Array.isArray(data)) {
          setUsers(data);
        }
      } catch (err) {
        console.error("Failed to fetch users");
      }
    };
    fetchUsers();
  }, [fetchProcesses]);

  const openCreateModal = async () => {
    try {
      const result = await getNextJobId();
      if (result.success) {
        setCreateForm((prev) => ({
          ...prev,
          job_number: result.data.next_job_number,
          stage: "",
          metal_type: "",
          categories: [],
          issue_size: "",
          issue_pieces: "",
          job_name: "",
          weight_unit: "g",
          customCategory: "",
          description: "",
          employee: user?.username || "",
        }));
        setIsCreateModalOpen(true);
      }
    } catch (error) {
      showToast("Failed to generate Job Number", "error");
    }
  };

  const openViewModal = (job_number) => {
    navigate(`/job-history/${job_number}`);
  };

  const handleCreateProcess = async (e) => {
    e.preventDefault();
    if (!createForm.stage) {
      triggerError();
      return showToast("Please select a Stage", "error");
    }
    if (!createForm.metal_type) {
      triggerError();
      return showToast("Please select a Metal Type", "error");
    }
    const selectedCategories = createForm.categories.filter(c => c !== "Other");
    if (createForm.categories.includes("Other")) {
      if (!createForm.customCategory) {
        triggerError();
        return showToast("Please enter a custom category name", "error");
      }
      selectedCategories.push(createForm.customCategory);
    }
    if (selectedCategories.length === 0) {
      triggerError();
      return showToast("Please select at least one Category", "error");
    }
    let weight = parseFloat(createForm.issue_size);
    if (createForm.weight_unit === "kg") weight *= 1000;
    weight = parseFloat(weight.toFixed(8));

    if (!createForm.job_number || !weight || weight <= 0) {
      triggerError();
      return showToast("Invalid issue size", "error");
    }
    try {
      await createProcess(createForm.stage, {
        job_number: createForm.job_number,
        job_name: createForm.job_number, // Default to job_number internally to prevent NULL
        metal_type: createForm.metal_type,
        unit: createForm.weight_unit,
        employee: createForm.employee || user?.username || "Unknown",
        issue_size: weight,
        issue_pieces: createForm.issue_pieces || 0,
        category: selectedCategories.join(", "),
        description: createForm.description || "",
      });
      showToast(`${createForm.stage} Process Created!`, "success");
      setIsCreateModalOpen(false);
      fetchProcesses();
    } catch (error) {
      triggerError();
      showToast(error.message || "Failed", "error");
    }
  };

  const openStartModal = (process) => {
    setSelectedProcess(process);
    setStartForm({
      issued_weight:
        process.metal_type === "Silver"
          ? parseFloat((process.issue_size / 1000).toFixed(10)).toString()
          : process.issue_size || "",
      issue_pieces: process.issue_pieces || "",
      weight_unit: process.metal_type === "Silver" ? "kg" : "g",
      description: process.description || "",
      employee: process.employee || user?.username || "",
    });
    setIsStartModalOpen(true);
  };

  const handleStartProcess = async (e) => {
    e.preventDefault();
    let weight = parseFloat(startForm.issued_weight);
    if (startForm.weight_unit === "kg") weight *= 1000;
    weight = parseFloat(weight.toFixed(8));

    if (!weight || weight <= 0) {
      triggerError();
      return showToast("Invalid weight", "error");
    }
    try {
      await startProcess(selectedProcess.stage, {
        process_id: selectedProcess.id,
        issued_weight: weight,
        issue_pieces: Math.max(parseInt(startForm.issue_pieces) || 0, 0),
        description: startForm.description || "",
        employee: startForm.employee || user?.username || "Unknown",
      });
      showToast("Started!", "success");
      setIsStartModalOpen(false);
      fetchProcesses();
    } catch (error) {
      triggerError();
      showToast(error.message, "error");
    }
  };

  const openEditModal = (process) => {
    setSelectedProcess(process);
    const isSil = process.metal_type === "Silver";
    const div = isSil ? 1000 : 1;

    // Pre-populate return_items from process_return_items if available (COMPLETED)
    const prefilledReturnItems =
      process.return_items && process.return_items.length > 0
        ? process.return_items.map((item) => ({
            category: item.category || "",
            return_weight: item.return_weight != null
              ? parseFloat((item.return_weight / div).toFixed(10)).toString()
              : "",
            return_pieces: item.return_pieces != null ? item.return_pieces.toString() : "",
            _isCustom: item.category
              ? !(sizeOptions[process.metal_type] || []).includes(item.category)
              : false,
          }))
        : process.status === "COMPLETED" && process.return_weight != null
        ? [{ category: process.category || "", return_weight: parseFloat((process.return_weight / div).toFixed(10)).toString(), return_pieces: (process.return_pieces || "").toString(), _isCustom: false }]
        : [{ category: "", return_weight: "", return_pieces: "" }];

    setEditForm({
      issued_weight: process.issued_weight
        ? parseFloat((process.issued_weight / div).toFixed(10)).toString()
        : "",
      scrap_weight:
        process.scrap_weight !== null && process.scrap_weight !== undefined
          ? parseFloat((process.scrap_weight / div).toFixed(10)).toString()
          : "",
      issue_pieces: process.issue_pieces || "",
      weight_unit: isSil ? "kg" : "g",
      categories: (() => {
        if (!process.category) return [];
        const parts = process.category.split(", ");
        const metalOpts = sizeOptions[process.metal_type] || [];
        const cats = [];
        const customParts = [];
        parts.forEach(p => {
          if (metalOpts.includes(p)) cats.push(p);
          else customParts.push(p);
        });
        if (customParts.length > 0) cats.push("Other");
        return cats.length > 0 ? cats : [];
      })(),
      customCategory: (() => {
        if (!process.category) return "";
        const parts = process.category.split(", ");
        const metalOpts = sizeOptions[process.metal_type] || [];
        return parts.filter(p => !metalOpts.includes(p)).join(", ");
      })(),
      description: process.description || "",
      employee: process.employee || "",
      return_items: prefilledReturnItems,
    });
    setIsEditModalOpen(true);
  };

  const handleEditProcess = async (e) => {
    e.preventDefault();
    let issueW = parseFloat(editForm.issued_weight);
    const isKg = editForm.weight_unit === "kg";
    if (isKg) issueW *= 1000;
    issueW = parseFloat(issueW.toFixed(8));

    let payload = {
      issued_weight: issueW,
      issue_pieces: parseInt(editForm.issue_pieces) || 0,
      category: (() => {
        let cats = editForm.categories.filter(c => c !== "Other");
        if (editForm.categories.includes("Other") && editForm.customCategory) {
          cats.push(editForm.customCategory);
        }
        return cats.join(", ");
      })(),
    };
    if (editForm.description !== undefined) {
      payload.description = editForm.description;
    }
    if (editForm.employee !== undefined) {
      payload.employee = editForm.employee;
    }

    if (
      selectedProcess?.status === "COMPLETED" ||
      selectedProcess?.status === "RUNNING"
    ) {
      const div = isKg ? 1000 : 1;
      const returnItems = (editForm.return_items || [])
        .filter(item => parseFloat(item.return_weight) > 0)
        .map(item => ({
          category: item.category || selectedProcess.category || "",
          return_weight: parseFloat(parseFloat(item.return_weight * div).toFixed(8)),
          return_pieces: parseInt(item.return_pieces) || 0,
        }));

      let scrW = parseFloat(editForm.scrap_weight) || 0;
      if (isKg) scrW *= 1000;
      scrW = parseFloat(scrW.toFixed(8));

      payload.return_items = returnItems;
      payload.return_weight = parseFloat(returnItems.reduce((s, i) => s + i.return_weight, 0).toFixed(8));
      payload.return_pieces = returnItems.reduce((s, i) => s + i.return_pieces, 0);
      payload.scrap_weight = scrW;
    }

    try {
      await editProcess(selectedProcess.stage, selectedProcess.id, payload);
      showToast("Job Updated Successfully!", "success");
      setIsEditModalOpen(false);
      fetchProcesses();
    } catch (error) {
      triggerError();
      showToast(error.message || "Failed to edit job", "error");
    }
  };

  const handleDeleteProcess = async (process) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Process",
      message: `Are you SURE you want to permanently delete the COMPLETED Job ${process.job_number} at the ${process.stage} stage? This will entirely reverse the stock math and return physical metals back to their raw states.`,
      isDestructive: true,
      confirmText: "Yes, Delete It",
      onConfirm: async () => {
        try {
          await deleteProcess(process.stage, process.id);
          showToast("Job Deleted and Stock Reversed!", "success");
          fetchProcesses();
        } catch (error) {
          showToast(error.message || "Failed to delete job", "error");
        }
      },
    });
  };

  const handleRevertProcess = async (process) => {
    setConfirmModal({
      isOpen: true,
      title: "Revert Process",
      message: `Are you sure you want to REVERT Job ${process.job_number}? This will un-do the current stage and step backwards, restoring stock correctly.`,
      isDestructive: false,
      confirmText: "Revert Now",
      onConfirm: async () => {
        try {
          await revertProcess(process.stage, process.id);
          showToast("Job Successfully Reverted!", "success");
          fetchProcesses();
        } catch (error) {
          showToast(error.message || "Failed to revert job", "error");
        }
      },
    });
  };

  const openCompleteModal = (process) => {
    setSelectedProcess(process);
    // Split multi-category strings (e.g. "1 gm, 2 gm") into individual return rows
    // so each category gets its own weight/pieces entry and appears individually in
    // finished goods. This matches the Silver behavior.
    const cats = (process.category || "").split(",").map(c => c.trim()).filter(Boolean);
    const initialItems = cats.length > 1
      ? cats.map(cat => ({ category: cat, return_weight: "", return_pieces: "" }))
      : [{ category: process.category || "", return_weight: "", return_pieces: "" }];
    setCompleteForm({
      return_items: initialItems,
      scrap_weight: "",
      weight_unit: process.metal_type === "Silver" ? "kg" : "g",
      description: process.description || "",
    });
    setIsCompleteModalOpen(true);
  };

  const handleCompleteProcess = async (e) => {
    e.preventDefault();
    
    const div = completeForm.weight_unit === "kg" ? 1000 : 1;
    
    const returnItems = completeForm.return_items
      .filter(item => parseFloat(item.return_weight) > 0)
      .map(item => ({
        category: item.category || selectedProcess.category || "",
        return_weight: parseFloat(parseFloat(item.return_weight * div).toFixed(8)),
        return_pieces: parseInt(item.return_pieces) || 0,
      }));

    const totalRetW = returnItems.reduce((sum, item) => sum + item.return_weight, 0);
    let scrW = parseFloat(completeForm.scrap_weight) || 0;
    if (completeForm.weight_unit === "kg") scrW *= 1000;
    scrW = parseFloat(scrW.toFixed(8));

    if (totalRetW <= 0) {
      triggerError();
      return showToast("At least one return weight must be > 0", "error");
    }

    if (scrW < 0) {
      triggerError();
      return showToast("Scrap weight cannot be negative", "error");
    }

    try {
      await completeProcess(selectedProcess.stage, {
        process_id: selectedProcess.id,
        return_items: returnItems,
        return_weight: totalRetW,
        scrap_weight: scrW,
        return_pieces: returnItems.reduce((sum, item) => sum + item.return_pieces, 0),
        description: completeForm.description || "",
      });
      showToast("Completed!", "success");
      setIsCompleteModalOpen(false);
      fetchProcesses();
    } catch (error) {
      triggerError();
      showToast(error.message, "error");
    }
  };

  const getLatestProcesses = (procs) => {
    const stagePriority = { Melting: 0, Rolling: 1, Press: 2, TPP: 3, Packing: 4 };
    const jobMap = {};

    procs.forEach((p) => {
      const key = p.job_number || `unknown-${p.id}`;

      if (!jobMap[key]) {
        jobMap[key] = p;
      } else {
        const existing = jobMap[key];
        if (stagePriority[p.stage] > stagePriority[existing.stage]) {
          jobMap[key] = p;
        } else if (stagePriority[p.stage] === stagePriority[existing.stage]) {
          if (new Date(p.date) > new Date(existing.date)) {
            jobMap[key] = p;
          }
        }
      }
    });

    return Object.values(jobMap).sort((a, b) => {
      const valA = a[sortConfig.key] || "";
      const valB = b[sortConfig.key] || "";

      if (sortConfig.key === "job_number") {
        return sortConfig.direction === "asc"
          ? valA.localeCompare(valB, undefined, { numeric: true })
          : valB.localeCompare(valA, undefined, { numeric: true });
      }

      if (sortConfig.key === "date") {
        return sortConfig.direction === "asc"
          ? new Date(valA) - new Date(valB)
          : new Date(valB) - new Date(valA);
      }

      return 0;
    });
  };

  const latestProcesses = getLatestProcesses(processes);

  const filteredProcesses = latestProcesses.filter(
    (p) =>
      (p.job_number || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.job_name || "").toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const incompleteProcesses = filteredProcesses.filter(
    (p) => p.status === "PENDING" || p.status === "RUNNING",
  );
  const completedProcesses = filteredProcesses.filter(
    (p) => p.status === "COMPLETED",
  );

  const tabProcesses = activeTab === "incomplete" ? incompleteProcesses : completedProcesses;
  const totalPages = Math.max(1, Math.ceil(tabProcesses.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedProcesses = tabProcesses.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const reqPieces = false;
  const issVal = selectedProcess
    ? parseFloat(selectedProcess.issued_weight) || 0
    : 0;
  const div = completeForm?.weight_unit === "kg" ? 1000 : 1;
  let retVal = (completeForm.return_items || []).reduce((sum, item) => sum + (parseFloat(item.return_weight) || 0), 0) * div;
  let scrVal = (parseFloat(completeForm.scrap_weight) || 0) * div;
  const liveLoss = parseFloat((issVal - retVal - scrVal).toFixed(10));
  const isLossNegative = liveLoss < 0;

  const editIssVal = parseFloat(editForm.issued_weight) || 0;
  let editRetWeight = (editForm.return_items || []).reduce((s, i) => s + (parseFloat(i.return_weight) || 0), 0);
  let editScrWeight = parseFloat(editForm.scrap_weight) || 0;
  if (editForm?.weight_unit === "kg") {
    editRetWeight *= 1000;
    editScrWeight *= 1000;
  }
  const editLiveLoss = parseFloat(
    (
      (editForm?.weight_unit === "kg" ? editIssVal * 1000 : editIssVal) -
      editRetWeight -
      editScrWeight
    ).toFixed(10),
  );
  const editIsLossNegative = editLiveLoss < 0;

  if (loading)
    return (
      <div className="p-8 text-center animate-pulse">
        Loading Production Floor...
      </div>
    );

  return (
    <div className="p-6 relative">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-800 tracking-tight">
            Production Floor
          </h1>
          <p className="text-gray-500 mt-1">Unified Process Table & Tracking</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex bg-gray-100 p-1 rounded-xl items-center border border-gray-200">
            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-3">
              Sort Job:
            </span>
            <button
              onClick={() =>
                setSortConfig({
                  key: "job_number",
                  direction: sortConfig.direction === "asc" ? "desc" : "asc",
                })
              }
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                sortConfig.key === "job_number"
                  ? "bg-white text-blue-600 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {sortConfig.direction === "asc" ? (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m3 16 4 4 4-4" />
                  <path d="M7 20V4" />
                  <path d="M11 4h10" />
                  <path d="M11 8h7" />
                  <path d="M11 12h4" />
                </svg>
              ) : (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m3 8 4-4 4 4" />
                  <path d="M7 4v16" />
                  <path d="M11 12h4" />
                  <path d="M11 16h7" />
                  <path d="M11 20h10" />
                </svg>
              )}
              Job {sortConfig.direction.toUpperCase()}
            </button>
          </div>
          <button
            onClick={openCreateModal}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 shadow-lg active:scale-95 transition-all"
          >
            <PlusCircle size={20} />{" "}
            <span className="font-semibold">Create Process Job</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
        <div className="p-4 border-b border-gray-100 flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search by Job Number or Name..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg outline-none focus:border-blue-500"
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100">
          <button
            onClick={() => { setActiveTab("incomplete"); setCurrentPage(1); }}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-bold transition-all border-b-2 ${
              activeTab === "incomplete"
                ? "border-orange-500 text-orange-600 bg-orange-50/50"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            Incomplete
            <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
              activeTab === "incomplete" ? "bg-orange-100 text-orange-700" : "bg-gray-100 text-gray-500"
            }`}>
              {incompleteProcesses.length}
            </span>
          </button>
          <button
            onClick={() => { setActiveTab("completed"); setCurrentPage(1); }}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-bold transition-all border-b-2 ${
              activeTab === "completed"
                ? "border-green-500 text-green-600 bg-green-50/50"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            Completed
            <span className={`px-2 py-0.5 rounded-full text-xs font-black ${
              activeTab === "completed" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
            }`}>
              {completedProcesses.length}
            </span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-sm uppercase tracking-wider">
                <th className="p-2 px-3 font-bold border-b border-gray-100">
                  Job No
                </th>
                <th className="p-2 px-3 font-bold border-b border-gray-100">
                  Stage
                </th>
                <th className="p-2 px-3 font-bold border-b border-gray-100">
                  Metal / Category
                </th>
                <th className="p-2 px-3 font-bold border-b border-gray-100">
                  Status
                </th>
                <th className="p-2 px-3 font-bold border-b border-gray-100" title="Issued / Return / Loss or Gain">
                  Weights (Iss/Ret/L|G)
                </th>
                <th className="p-2 px-3 font-bold border-b border-gray-100 text-center">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {pagedProcesses.map((p) => (
                <tr
                  key={`${p.stage}-${p.id}`}
                  onClick={() => openViewModal(p.job_number)}
                  className="hover:bg-blue-50/80 transition-all cursor-pointer group/row border-b border-gray-100"
                >
                  <td className="p-4">
                    <div className="font-bold text-gray-800 text-base">
                      {p.job_number}
                    </div>
                    {/* {p.employee && (
                      <div className="text-[10px] font-bold text-blue-600 uppercase tracking-widest mt-1">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="10"
                          height="10"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="inline mr-1"
                        >
                          <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                        {p.employee}
                      </div>
                    )} */}
                    {p.description && (
                      <div
                        className="text-xs text-gray-500 mt-1.5 truncate max-w-[150px]"
                        title={p.description}
                      >
                        {p.description}
                      </div>
                    )}
                  </td>
                  <td className="p-4 font-bold text-blue-800">{p.stage}</td>
                  <td className="p-4 flex flex-col items-start gap-1">
                    <span
                      className={`px-2 py-1 rounded-md text-xs font-bold ${p.metal_type === "Gold" ? "bg-yellow-100 text-yellow-800" : "bg-gray-200 text-gray-700"}`}
                    >
                      {p.metal_type}
                    </span>
                    <span className="text-xs font-semibold text-gray-500">
                      {p.status === "COMPLETED" && p.return_items && p.return_items.length > 0
                        ? [...new Set(p.return_items.map((item) => item.category).filter(Boolean))].join(", ")
                        : p.category}
                    </span>
                  </td>
                  <td className="p-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold border ${p.status === "PENDING" ? "bg-orange-50 text-orange-700 border-orange-200" : p.status === "RUNNING" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-green-50 text-green-700 border-green-200"}`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="p-4 text-sm font-mono text-gray-700 whitespace-nowrap">
                    <div>
                      <span className="text-gray-400">Iss:</span>{" "}
                      {formatWeight(
                        p.issued_weight ? p.issued_weight : p.issue_size || 0,
                        p.unit,
                      )}
                    </div>
                    {p.status === "COMPLETED" && (
                      <>
                        <div className="text-green-600">
                          <span className="text-gray-400">Ret:</span>{" "}
                          {formatWeight(p.return_weight || 0, p.unit)}
                        </div>
                        <div className={p.loss_weight < 0 ? "text-green-600" : "text-red-500"}>
                          <span className="text-gray-400">{p.loss_weight < 0 ? "Gai:" : "Los:"}</span>{" "}
                          {formatWeight(Math.abs(p.loss_weight || 0), p.unit)}
                        </div>
                      </>
                    )}
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col items-center gap-2">
                      {p.status === "COMPLETED" && (
                        <CheckCircle size={20} className="text-green-500" />
                      )}

                      <div className="grid grid-cols-2 gap-2">
                        {p.status === "PENDING" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openStartModal(p);
                            }}
                            className="bg-orange-500 text-white px-2 py-1.5 rounded-lg text-xs font-bold hover:bg-orange-600 active:scale-95 flex items-center justify-center gap-1 whitespace-nowrap"
                          >
                            <PlayCircle size={14} /> Start Process
                          </button>
                        )}
                        {p.status === "RUNNING" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openCompleteModal(p);
                            }}
                            className="bg-blue-600 text-white px-2 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-700 active:scale-95 flex items-center justify-center gap-1 whitespace-nowrap"
                          >
                            <ArrowRightCircle size={14} /> Complete Process
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(p);
                            }}
                            className="bg-gray-100 text-gray-700 border border-gray-300 px-2 py-1.5 rounded-lg text-xs font-bold hover:bg-gray-200 active:scale-95 flex items-center justify-center gap-1 whitespace-nowrap"
                          >
                            <Edit size={14} /> Edit
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteProcess(p);
                            }}
                            className="bg-red-50 text-red-600 border border-red-200 px-2 py-1.5 rounded-lg text-xs font-bold hover:bg-red-100 active:scale-95 flex items-center justify-center gap-1 whitespace-nowrap"
                          >
                            <Trash2 size={14} /> Delete
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRevertProcess(p);
                            }}
                            className="bg-purple-50 text-purple-600 border border-purple-200 px-2 py-1.5 rounded-lg text-xs font-bold hover:bg-purple-100 active:scale-95 flex items-center justify-center gap-1 whitespace-nowrap"
                            title="Revert Step & Re-Balance Stock"
                          >
                            <ArrowDownLeft size={14} /> Revert
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openViewModal(p.job_number);
                          }}
                          className="bg-white border border-gray-200 text-gray-600 hover:text-gray-800 hover:bg-gray-50 active:scale-95 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-bold transition-colors whitespace-nowrap"
                        >
                          <Eye size={14} /> View
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pagedProcesses.length === 0 && (
            <div className="p-8 text-center text-gray-400">
              {activeTab === "incomplete" ? "No incomplete jobs found." : "No completed jobs found."}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-xs text-gray-500">
              Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, tabProcesses.length)} of {tabProcesses.length} jobs
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={safePage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                ← Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                    page === safePage
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                disabled={safePage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* CREATE MODAL */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title={createForm.job_number || "Create Process Job"}
        maxWidth="max-w-2xl"
      >
        <form
          onSubmit={handleCreateProcess}
          className={`space-y-5 ${isShaking ? "animate-shake" : ""}`}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <div className="col-span-1">
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                Stage
              </label>
              <select
                  className="w-full bg-blue-50 border border-blue-200 py-2.5 px-3 rounded-lg font-bold outline-none text-blue-800"
                  value={createForm.stage}
                  required
                  onChange={(e) => {
                    setCreateForm({
                      ...createForm,
                      stage: e.target.value,
                    });
                  }}
                >
                  <option value="" disabled>Select Stage</option>
                  <option value="Melting">Melting</option>
                  <option value="Rolling">Rolling</option>
                  <option value="Press">Press</option>
                  <option value="TPP">TPP</option>
                  <option value="Packing">Packing</option>
                </select>
            </div>

            <div className="col-span-1">
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                Metal
              </label>
              <select
                  className="w-full bg-gray-50 border border-gray-200 py-2.5 px-3 rounded-lg font-bold outline-none"
                  value={createForm.metal_type}
                  required
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      metal_type: e.target.value,
                      categories: [],
                      weight_unit: e.target.value === "Silver" ? "kg" : "g",
                    })
                  }
                >
                  <option value="" disabled>Select Metal</option>
                  <option value="Gold">Gold</option>
                  <option value="Silver">Silver</option>
                </select>
            </div>

            <div className="col-span-1">
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                Category <span className="text-gray-400 font-normal">(Multi)</span>
              </label>
              <div className="relative">
                <button
                  type="button"
                  disabled={!createForm.metal_type}
                  onClick={() => setCreateForm({ ...createForm, _catOpen: !createForm._catOpen })}
                  className={`w-full bg-gray-50 border py-2.5 px-3 rounded-lg font-bold outline-none text-left text-sm truncate ${
                    !createForm.metal_type
                      ? "border-gray-100 text-gray-300 cursor-not-allowed"
                      : "border-gray-200 cursor-pointer"
                  }`}
                >
                  {createForm.categories.length === 0
                    ? <span className="text-gray-400 font-normal">Select Category</span>
                    : formatCategoryDisplay(createForm.categories, createForm.customCategory)}
                </button>
                {createForm._catOpen && createForm.metal_type && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-52 overflow-y-auto">
                    {sizeOptions[createForm.metal_type]?.map((c) => (
                      <label key={c} className="flex items-center gap-2 px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm font-medium">
                        <input
                          type="checkbox"
                          checked={createForm.categories.includes(c)}
                          onChange={(e) => {
                            const updated = e.target.checked
                              ? [...createForm.categories, c]
                              : createForm.categories.filter(cat => cat !== c);
                            setCreateForm({ ...createForm, categories: updated });
                          }}
                          className="accent-blue-600 w-4 h-4"
                        />
                        {c}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {createForm.categories.includes("Other") && (
              <div className="col-span-1">
                <label className="block text-xs font-bold text-blue-700 mb-1.5 uppercase tracking-wide">
                  Custom Category Name
                </label>
                <input
                  type="text"
                  className="w-full bg-blue-50 border-2 border-blue-200 text-blue-900 py-2.5 px-3 rounded-lg outline-none font-bold placeholder:text-blue-300 focus:border-blue-500 transition-all"
                  value={createForm.customCategory}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      customCategory: e.target.value,
                    })
                  }
                  placeholder="Enter custom category..."
                />
              </div>
            )}

            {/* <div className="col-span-1">
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                Assigned Employee
              </label>
              <select
                className="w-full bg-blue-50/50 border border-blue-200 py-2.5 px-3 rounded-lg font-bold text-blue-900 outline-none focus:border-blue-500 transition-colors cursor-pointer"
                value={createForm.employee}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    employee: e.target.value,
                  })
                }
              >
                <option value="" disabled>
                  Select Employee
                </option>
                {users
                  .filter((u) => u.role === "EMPLOYEE")
                  .map((u) => (
                    <option key={u.id} value={u.username}>
                      {u.username}
                    </option>
                  ))}
              </select>
            </div> */}

            <div className="col-span-1">
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                Issue Size (Opening Stock)
              </label>
              <div className="flex bg-gray-50 border border-gray-200 rounded-lg focus-within:border-blue-500 overflow-hidden transition-colors">
                <input
                  type="number"
                  step="0.001"
                  required
                  className="w-full bg-transparent py-2.5 px-3 font-bold text-lg outline-none"
                  value={createForm.issue_size}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, issue_size: e.target.value })
                  }
                  placeholder="0.000"
                />
                <select
                  className="bg-gray-100 border-l border-gray-200 px-3 font-bold text-gray-600 outline-none"
                  value={createForm.weight_unit}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      weight_unit: e.target.value,
                    })
                  }
                >
                  <option value="g">g</option>
                  <option value="kg">kg</option>
                </select>
              </div>
            </div>

            <div className="col-span-1">
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                Issue Pieces{" "}
                <span className="text-gray-400 font-normal tracking-normal">
                  (Optional)
                </span>
              </label>
              <input
                type="number"
                step="1"
                min="0"
                className="w-full bg-gray-50 border border-gray-200 py-2.5 px-3 rounded-lg font-bold text-lg outline-none focus:bg-white focus:border-blue-500 transition-colors"
                value={createForm.issue_pieces}
                onChange={(e) =>
                  setCreateForm({ ...createForm, issue_pieces: e.target.value })
                }
                placeholder="0"
              />
            </div>

            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                Description / Notes{" "}
                <span className="text-gray-400 font-normal tracking-normal">
                  (Optional)
                </span>
              </label>
              <textarea
                className="w-full bg-gray-50 border border-gray-200 py-2 px-3 text-sm rounded-lg outline-none focus:bg-white focus:border-blue-500 min-h-20 transition-colors"
                value={createForm.description}
                onChange={(e) =>
                  setCreateForm({ ...createForm, description: e.target.value })
                }
                placeholder="Add any specific requirements or notes..."
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 flex justify-center gap-2 transition-colors active:scale-95"
          >
            <PlusCircle size={20} /> Create Job
          </button>
        </form>
      </Modal>

      {/* START MODAL */}
      <Modal
        isOpen={isStartModalOpen}
        onClose={() => setIsStartModalOpen(false)}
        title={`Start ${selectedProcess?.stage}`}
        maxWidth="max-w-2xl"
      >
        <form
          onSubmit={handleStartProcess}
          className={`space-y-5 ${isShaking ? "animate-shake" : ""}`}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <div className="col-span-1 bg-yellow-50 p-4 rounded-xl border border-yellow-200">
              <label className="block text-xs font-bold text-yellow-800 mb-1.5 uppercase tracking-wide">
                Actual Weigh-In (Issued)
              </label>
              <div className="flex bg-white border border-yellow-300 rounded-lg overflow-hidden focus-within:border-orange-500 transition-colors">
                <input
                  type="number"
                  step="0.001"
                  required
                  className="w-full bg-transparent py-2.5 px-3 font-bold text-lg text-yellow-900 outline-none"
                  value={startForm.issued_weight}
                  onChange={(e) =>
                    setStartForm({
                      ...startForm,
                      issued_weight: e.target.value,
                    })
                  }
                  placeholder="0.000"
                />
                <select
                  className="bg-yellow-100 border-l border-yellow-300 px-3 font-bold text-yellow-900 outline-none"
                  value={startForm.weight_unit}
                  onChange={(e) =>
                    setStartForm({ ...startForm, weight_unit: e.target.value })
                  }
                >
                  <option value="g">g</option>
                  <option value="kg">kg</option>
                </select>
              </div>
            </div>

            {/* <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                Assigned Employee
              </label>
              <select
                className="w-full bg-blue-50/50 border-2 border-blue-200 py-2.5 px-3 rounded-lg font-bold text-blue-900 outline-none vivid-focus-blue transition-all cursor-pointer"
                value={startForm.employee}
                onChange={(e) =>
                  setStartForm({
                    ...startForm,
                    employee: e.target.value,
                  })
                }
              >
                <option value="" disabled>
                  Select Employee
                </option>
                {users
                  .filter((u) => u.role === "EMPLOYEE")
                  .map((u) => (
                    <option key={u.id} value={u.username}>
                      {u.username}
                    </option>
                  ))}
              </select>
            </div> */}

            <div className="col-span-1 bg-yellow-50 p-4 rounded-xl border border-yellow-200">
              <label className="block text-xs font-bold text-yellow-800 mb-1.5 uppercase tracking-wide">
                Actual Piece Count{" "}
                <span className="text-yellow-600/70 font-normal tracking-normal">
                  (Optional)
                </span>
              </label>
              <input
                type="number"
                step="1"
                min="0"
                className="w-full bg-white border-2 border-yellow-300 py-2.5 px-3 rounded-lg font-bold text-lg text-yellow-900 outline-none vivid-focus-orange transition-all"
                value={startForm.issue_pieces}
                onChange={(e) =>
                  setStartForm({ ...startForm, issue_pieces: e.target.value })
                }
                placeholder="0"
              />
            </div>

            <div className="col-span-2 bg-yellow-50 p-4 rounded-xl border border-yellow-200">
              <label className="block text-xs font-bold text-yellow-800 mb-1.5 uppercase tracking-wide">
                Description / Notes{" "}
                <span className="text-yellow-600/70 font-normal tracking-normal">
                  (Optional)
                </span>
              </label>
              <textarea
                className="w-full bg-white border-2 border-yellow-300 py-2 px-3 text-sm rounded-lg outline-none vivid-focus-orange min-h-20 transition-all font-medium"
                value={startForm.description}
                onChange={(e) =>
                  setStartForm({ ...startForm, description: e.target.value })
                }
                placeholder="Add any specific requirements or notes..."
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-orange-500 text-white font-bold py-3.5 rounded-xl hover:bg-orange-600 flex justify-center gap-2 transition-colors active:scale-95"
          >
            <PlayCircle size={20} /> Start Process
          </button>
        </form>
      </Modal>

      {/* COMPLETE MODAL */}
      <Modal
        isOpen={isCompleteModalOpen}
        onClose={() => setIsCompleteModalOpen(false)}
        title={`Complete ${selectedProcess?.stage}`}
        maxWidth="max-w-2xl"
      >
        <form
          onSubmit={handleCompleteProcess}
          className={`space-y-5 ${isShaking ? "animate-shake" : ""}`}
        >
          {/* Weight Unit Toggle */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
              Weight Unit
            </label>
            <div className="flex bg-gray-100 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setCompleteForm({ ...completeForm, weight_unit: "g" })}
                className={`flex-1 py-1.5 text-sm font-bold rounded-md transition-colors ${completeForm?.weight_unit === "g" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                Grams (g)
              </button>
              <button
                type="button"
                onClick={() => setCompleteForm({ ...completeForm, weight_unit: "kg" })}
                className={`flex-1 py-1.5 text-sm font-bold rounded-md transition-colors ${completeForm?.weight_unit === "kg" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
              >
                Kilogram (kg)
              </button>
            </div>
          </div>

          {/* Return Items */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs font-bold text-green-700 uppercase tracking-wide">
                Return Weights (by Size)
              </label>
              <button
                type="button"
                onClick={() =>
                  setCompleteForm({
                    ...completeForm,
                    return_items: [
                      ...completeForm.return_items,
                      { category: "", return_weight: "", return_pieces: "" },
                    ],
                  })
                }
                className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors border border-blue-200"
              >
                + Add Row
              </button>
            </div>

            <div className="space-y-2">
              {/* Column labels */}
              <div className="grid grid-cols-12 gap-2 px-2 text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                <div className="col-span-4">Category / Size</div>
                <div className="col-span-4">Weight ({completeForm.weight_unit})</div>
                <div className="col-span-3">Pieces</div>
                <div className="col-span-1"></div>
              </div>
              {completeForm.return_items.map((item, idx) => {
                const metalSizes = sizeOptions[selectedProcess?.metal_type] || [];
                const isStandardCategory = metalSizes.includes(item.category);
                const isCustom = item._isCustom || (!isStandardCategory && item.category !== "");
                const selectValue = isCustom ? "Other" : item.category;

                return (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-green-50 border border-green-200 p-2 rounded-lg">
                  <div className="col-span-4">
                    <select
                      value={selectValue}
                      onChange={(e) => {
                        const newItems = [...completeForm.return_items];
                        if (e.target.value === "Other") {
                          newItems[idx] = { ...newItems[idx], category: "", _isCustom: true };
                        } else {
                          newItems[idx] = { ...newItems[idx], category: e.target.value, _isCustom: false };
                        }
                        setCompleteForm({ ...completeForm, return_items: newItems });
                      }}
                      className="w-full bg-white border border-green-200 py-2 px-2 rounded text-sm font-medium outline-none"
                    >
                      <option value="">Select Size</option>
                      {metalSizes.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    {isCustom && (
                      <input
                        type="text"
                        placeholder="Enter custom category..."
                        value={item.category}
                        onChange={(e) => {
                          const newItems = [...completeForm.return_items];
                          newItems[idx] = { ...newItems[idx], category: e.target.value, _isCustom: true };
                          setCompleteForm({ ...completeForm, return_items: newItems });
                        }}
                        className="w-full mt-1 bg-white border border-blue-200 py-1.5 px-2 rounded text-xs font-medium outline-none"
                      />
                    )}
                  </div>
                  <div className="col-span-4">
                    <input
                      type="number"
                      step="0.001"
                      placeholder={`0.000`}
                      value={item.return_weight}
                      onChange={(e) => {
                        const newItems = [...completeForm.return_items];
                        newItems[idx] = { ...newItems[idx], return_weight: e.target.value };
                        setCompleteForm({ ...completeForm, return_items: newItems });
                      }}
                      className="w-full bg-white border border-green-200 py-2 px-2 rounded text-xl font-bold outline-none"
                    />
                  </div>
                  <div className="col-span-3">
                    <input
                      type="number"
                      step="1"
                      placeholder="0"
                      value={item.return_pieces}
                      onChange={(e) => {
                        const newItems = [...completeForm.return_items];
                        newItems[idx] = { ...newItems[idx], return_pieces: e.target.value };
                        setCompleteForm({ ...completeForm, return_items: newItems });
                      }}
                      className="w-full bg-white border border-green-200 py-2 px-2 rounded text-sm font-bold outline-none"
                    />
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {completeForm.return_items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          const newItems = completeForm.return_items.filter((_, i) => i !== idx);
                          setCompleteForm({ ...completeForm, return_items: newItems });
                        }}
                        className="text-red-400 hover:text-red-600 font-bold text-lg leading-none"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          </div>

          {/* Scrap */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase">
              Scrap/Dust ({completeForm.weight_unit})
            </label>
            <input
              type="number"
              step="0.001"
              className="w-full bg-yellow-50/50 border-2 border-yellow-200 py-2.5 px-3 rounded-lg font-bold text-xl outline-none transition-all"
              value={completeForm.scrap_weight}
              onChange={(e) => setCompleteForm({ ...completeForm, scrap_weight: e.target.value })}
              placeholder="0.000"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase">
              Description / Notes (Optional)
            </label>
            <textarea
              className="w-full bg-gray-50 border-2 border-blue-200 py-2.5 px-3 rounded-lg outline-none min-h-16 text-sm transition-all font-medium"
              value={completeForm.description || ""}
              onChange={(e) => setCompleteForm({ ...completeForm, description: e.target.value })}
              placeholder="Add completion notes..."
            />
          </div>

          {/* Live loss summary */}
          <div className="bg-gray-800 text-gray-200 p-4 rounded-xl font-mono shadow-inner flex flex-col gap-1.5">
            <div className="flex justify-between text-sm">
              <span>Issued ({completeForm?.weight_unit || "g"}):</span>
              <span>{parseFloat((issVal / (completeForm?.weight_unit === "kg" ? 1000 : 1)).toFixed(10))}</span>
            </div>
            <div className="flex justify-between text-sm text-green-400">
              <span>- Total Return:</span>
              <span>{parseFloat((retVal / (completeForm?.weight_unit === "kg" ? 1000 : 1)).toFixed(10))}</span>
            </div>
            <div className="flex justify-between text-sm text-yellow-400 mb-2">
              <span>- Scrap:</span>
              <span>{parseFloat((scrVal / (completeForm?.weight_unit === "kg" ? 1000 : 1)).toFixed(10))}</span>
            </div>
            <div className="border-t border-gray-600 pt-3 flex justify-between font-bold text-lg">
              <span>{isLossNegative ? "Gain:" : "Loss:"}</span>
              <span className={isLossNegative ? "text-green-400" : "text-white"}>
                {isLossNegative ? "+" : ""}
                {parseFloat((Math.abs(liveLoss) / (completeForm?.weight_unit === "kg" ? 1000 : 1)).toFixed(10))}
              </span>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white font-bold py-3.5 rounded-xl hover:bg-blue-700 transition-colors"
          >
            Complete Process
          </button>
        </form>
      </Modal>
      {/* EDIT MODAL */}
      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={`Edit Job: ${selectedProcess?.job_number} (${selectedProcess?.stage})`}
        maxWidth="max-w-2xl"
      >
        <form
          onSubmit={handleEditProcess}
          className={`space-y-5 ${isShaking ? "animate-shake" : ""}`}
        >
          <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200 flex gap-3 items-start">
            <div className="text-yellow-600 mt-0.5">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div>
              <p className="text-xs text-yellow-800 font-bold mb-0.5">
                Retroactive Edit Notice
              </p>
              <p className="text-[11px] text-yellow-700 leading-tight">
                Modifying weights perfectly re-balances pooled stock and base
                inventory.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <div className="col-span-1">
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                Issue Weight
              </label>
              <div className="flex bg-gray-50 border border-gray-200 rounded-lg focus-within:border-blue-500 transition-colors overflow-hidden">
                <input
                  type="number"
                  step="0.001"
                  className="w-full bg-transparent text-gray-700 py-2.5 px-3 outline-none font-bold"
                  value={editForm.issued_weight}
                  onChange={(e) =>
                    setEditForm({ ...editForm, issued_weight: e.target.value })
                  }
                  required
                />
                <select
                  className="bg-gray-100 border-l border-gray-200 px-3 font-bold text-gray-600 outline-none"
                  value={editForm.weight_unit}
                  onChange={(e) =>
                    setEditForm({ ...editForm, weight_unit: e.target.value })
                  }
                >
                  <option value="g">g</option>
                  <option value="kg">kg</option>
                </select>
              </div>
            </div>

            <div className="col-span-1">
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                Category <span className="text-gray-400 font-normal">(Multi)</span>
              </label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setEditForm({ ...editForm, _catOpen: !editForm._catOpen })}
                  className="w-full bg-gray-50 border border-gray-200 py-2.5 px-3 rounded-lg font-bold outline-none cursor-pointer text-left text-sm truncate"
                >
                  {formatCategoryDisplay(editForm.categories, editForm.customCategory)}
                </button>
                {editForm._catOpen && (
                  <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-xl max-h-52 overflow-y-auto">
                    {sizeOptions[selectedProcess?.metal_type]?.map((c) => (
                      <label key={c} className="flex items-center gap-2 px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm font-medium">
                        <input
                          type="checkbox"
                          checked={editForm.categories.includes(c)}
                          onChange={(e) => {
                            const updated = e.target.checked
                              ? [...editForm.categories, c]
                              : editForm.categories.filter(cat => cat !== c);
                            setEditForm({ ...editForm, categories: updated });
                          }}
                          className="accent-blue-600 w-4 h-4"
                        />
                        {c}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {editForm.categories.includes("Other") && (
              <div className="col-span-2">
                <label className="block text-xs font-bold text-blue-700 mb-1.5 uppercase tracking-wide">
                  Custom Category Name
                </label>
                <input
                  type="text"
                  className="w-full bg-blue-50 border-2 border-blue-200 text-blue-900 py-2.5 px-3 rounded-lg outline-none font-bold placeholder:text-blue-300 focus:border-blue-500 transition-all"
                  value={editForm.customCategory}
                  onChange={(e) =>
                    setEditForm({
                      ...editForm,
                      customCategory: e.target.value,
                    })
                  }
                  placeholder="Enter custom category..."
                />
              </div>
            )}

            <div className="col-span-1">
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                Issue Pieces{" "}
                <span className="text-gray-400 font-normal tracking-normal">
                  (Optional)
                </span>
              </label>
              <input
                type="number"
                className="w-full bg-gray-50 border border-gray-200 text-gray-700 py-2.5 px-3 rounded-lg outline-none font-bold focus:border-blue-500 transition-colors"
                value={editForm.issue_pieces}
                onChange={(e) =>
                  setEditForm({ ...editForm, issue_pieces: e.target.value })
                }
                placeholder="0"
              />
            </div>

            {/* <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                Assigned Employee{" "}
                <span className="text-gray-400 font-normal tracking-normal">
                  (Optional)
                </span>
              </label>
              <select
                className="w-full bg-blue-50/50 border border-blue-200 py-2.5 px-3 rounded-lg font-bold text-blue-900 outline-none focus:border-blue-500 transition-colors cursor-pointer"
                value={editForm.employee}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    employee: e.target.value,
                  })
                }
              >
                <option value="" disabled>
                  Select Employee
                </option>
                {users
                  .filter((u) => u.role === "EMPLOYEE")
                  .map((u) => (
                    <option key={u.id} value={u.username}>
                      {u.username}
                    </option>
                  ))}
              </select>
            </div> */}

            {selectedProcess?.status === "COMPLETED" ||
            selectedProcess?.status === "RUNNING" ? (
              <>
                <div className="col-span-2 border-t border-gray-100 pt-4 space-y-3">
                  <div className="flex justify-between items-center">
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                      Output Adjustments (by Size)
                    </p>
                    <button
                      type="button"
                      onClick={() =>
                        setEditForm({
                          ...editForm,
                          return_items: [
                            ...(editForm.return_items || []),
                            { category: "", return_weight: "", return_pieces: "" },
                          ],
                        })
                      }
                      className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded-lg transition-colors border border-blue-200"
                    >
                      + Add Row
                    </button>
                  </div>

                  {/* Column labels */}
                  <div className="grid grid-cols-12 gap-2 px-1 text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                    <div className="col-span-4">Category / Size</div>
                    <div className="col-span-4">Weight ({editForm.weight_unit})</div>
                    <div className="col-span-3">Pieces</div>
                    <div className="col-span-1"></div>
                  </div>

                  {(editForm.return_items || []).map((item, idx) => {
                    const metalSizes = sizeOptions[selectedProcess?.metal_type] || [];
                    const isStandardCategory = metalSizes.includes(item.category);
                    const isCustom = item._isCustom || (!isStandardCategory && item.category !== "");
                    const selectValue = isCustom ? "Other" : item.category;
                    return (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-green-50 border border-green-200 p-2 rounded-lg">
                        <div className="col-span-4">
                          <select
                            value={selectValue}
                            onChange={(e) => {
                              const newItems = [...(editForm.return_items || [])];
                              if (e.target.value === "Other") {
                                newItems[idx] = { ...newItems[idx], category: "", _isCustom: true };
                              } else {
                                newItems[idx] = { ...newItems[idx], category: e.target.value, _isCustom: false };
                              }
                              setEditForm({ ...editForm, return_items: newItems });
                            }}
                            className="w-full bg-white border border-green-200 py-1.5 px-2 rounded text-sm font-medium outline-none"
                          >
                            <option value="">Select Size</option>
                            {metalSizes.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                          {isCustom && (
                            <input
                              type="text"
                              placeholder="Custom category..."
                              value={item.category}
                              onChange={(e) => {
                                const newItems = [...(editForm.return_items || [])];
                                newItems[idx] = { ...newItems[idx], category: e.target.value, _isCustom: true };
                                setEditForm({ ...editForm, return_items: newItems });
                              }}
                              className="w-full mt-1 bg-white border border-blue-200 py-1 px-2 rounded text-xs font-medium outline-none"
                            />
                          )}
                        </div>
                        <div className="col-span-4">
                          <input
                            type="number"
                            step="0.001"
                            placeholder="0.000"
                            value={item.return_weight}
                            onChange={(e) => {
                              const newItems = [...(editForm.return_items || [])];
                              newItems[idx] = { ...newItems[idx], return_weight: e.target.value };
                              setEditForm({ ...editForm, return_items: newItems });
                            }}
                            className="w-full bg-white border border-green-200 py-1.5 px-2 rounded text-base font-bold outline-none"
                          />
                        </div>
                        <div className="col-span-3">
                          <input
                            type="number"
                            step="1"
                            placeholder="0"
                            value={item.return_pieces}
                            onChange={(e) => {
                              const newItems = [...(editForm.return_items || [])];
                              newItems[idx] = { ...newItems[idx], return_pieces: e.target.value };
                              setEditForm({ ...editForm, return_items: newItems });
                            }}
                            className="w-full bg-white border border-green-200 py-1.5 px-2 rounded text-sm font-bold outline-none"
                          />
                        </div>
                        <div className="col-span-1 flex justify-center">
                          {(editForm.return_items || []).length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                const newItems = (editForm.return_items || []).filter((_, i) => i !== idx);
                                setEditForm({ ...editForm, return_items: newItems });
                              }}
                              className="text-red-400 hover:text-red-600 font-bold text-lg leading-none"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">
                      Scrap / Dust
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      className="w-full bg-gray-50 border border-gray-200 text-gray-700 py-2.5 px-3 rounded-lg outline-none font-bold focus:border-blue-500 transition-colors"
                      value={editForm.scrap_weight}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          scrap_weight: e.target.value,
                        })
                      }
                      placeholder="0.000"
                    />
                  </div>

                  <div className="bg-gray-800 text-gray-200 p-4 rounded-xl font-mono shadow-inner flex flex-col justify-center gap-1.5">
                    <div className="flex justify-between text-sm">
                      <span>Issued ({editForm?.weight_unit || "g"}):</span>
                      <span>{editIssVal}</span>
                    </div>
                    <div className="flex justify-between text-sm text-green-400">
                      <span>- Total Return:</span>
                      <span>{parseFloat((editRetWeight / (editForm?.weight_unit === "kg" ? 1000 : 1)).toFixed(10))}</span>
                    </div>
                    <div className="flex justify-between text-sm text-yellow-400 mb-2">
                      <span>- Scrap:</span>
                      <span>{parseFloat(editForm.scrap_weight || 0)}</span>
                    </div>
                    <div className="border-t border-gray-600 pt-3 flex justify-between font-bold text-lg">
                      <span>{editIsLossNegative ? "Gain:" : "Loss:"}</span>
                      <span className={editIsLossNegative ? "text-green-400" : "text-white"}>
                        {editIsLossNegative ? "+" : ""}
                        {parseFloat((Math.abs(editLiveLoss) / (editForm?.weight_unit === "kg" ? 1000 : 1)).toFixed(10))}
                      </span>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="col-span-1 border-l border-gray-100 pl-6 flex items-center justify-center text-sm text-gray-400 italic">
                <p>Job is PENDING. Output fields are locked.</p>
              </div>
            )}

            <div
              className={`col-span-1 flex flex-col ${selectedProcess?.status === "COMPLETED" || selectedProcess?.status === "RUNNING" ? "mt-4" : ""}`}
            >
              {/* <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                Assigned Employee
              </label>
              <select
                className="w-full mb-3 bg-blue-50/50 border border-blue-200 py-2.5 px-3 rounded-lg font-bold text-blue-900 outline-none focus:border-blue-500 transition-colors cursor-pointer"
                value={editForm.employee || ""}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    employee: e.target.value,
                  })
                }
              >
                <option value="" disabled>
                  Select Employee
                </option>
                {users
                  .filter((u) => u.role === "EMPLOYEE")
                  .map((u) => (
                    <option key={u.id} value={u.username}>
                      {u.username}
                    </option>
                  ))}
              </select> */}

              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                Description / Notes{" "}
                <span className="text-gray-400 font-normal tracking-normal">
                  (Optional)
                </span>
              </label>
              <textarea
                className="w-full bg-gray-50 border border-gray-200 text-gray-700 py-2 px-3 text-sm rounded-lg outline-none focus:border-blue-500 transition-colors flex-1 min-h-20"
                value={editForm.description}
                onChange={(e) =>
                  setEditForm({ ...editForm, description: e.target.value })
                }
                placeholder="View or edit notes..."
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-blue-600 text-white font-bold py-3.5 text-sm rounded-xl hover:bg-blue-700 transition-all mt-2 flex items-center justify-center gap-2"
          >
            <Edit size={16} /> Update Process Database
          </button>
        </form>
      </Modal>

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        isDestructive={confirmModal.isDestructive}
        confirmText={confirmModal.confirmText}
      />
    </div>
  );
};

export default ProductionJobs;
