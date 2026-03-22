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
    "0.05",
    "0.1 gm",
    "0.200",
    "0.5 gm",
    "1 gm",
    "2 gm",
    "5 gm",
    "10 gm",
    "20 gm",
    "25 gm",
    "50 gm",
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
  ],
};

const stages = ["Rolling", "Press", "TPP", "Packing"];

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
  const [isNextStep, setIsNextStep] = useState(false);

  const [selectedProcess, setSelectedProcess] = useState(null);

  const [createForm, setCreateForm] = useState({
    stage: "Rolling",
    job_number: "",
    original_next_job: "",
    metal_type: "Gold",
    category: sizeOptions["Gold"][0],
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
    return_weight: "",
    scrap_weight: "",
    return_pieces: "",
    weight_unit: "g",
    description: "",
  });
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    issued_weight: "",
    weight_unit: "g",
    description: "",
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
          original_next_job: result.data.next_job_number,
          stage: "Rolling",
          metal_type: "Gold",
          category: sizeOptions["Gold"][0],
          issue_size: "",
          issue_pieces: "",
          job_name: "",
          weight_unit: "g",
          description: "",
          employee: user?.username || "",
        }));
        setIsNextStep(false);
        setIsCreateModalOpen(true);
      }
    } catch (error) {
      showToast("Failed to generate Job Number", "error");
    }
  };

  const openNextStepModal = (process) => {
    let nextStage = "Rolling";
    if (process.stage === "Rolling") nextStage = "Press";
    if (process.stage === "Press") nextStage = "TPP";
    if (process.stage === "TPP") nextStage = "Packing";
    if (process.stage === "Packing")
      return showToast("Packing is the final stage.", "error");

    setCreateForm({
      stage: nextStage,
      job_number: process.job_number,
      job_name: process.job_name || "",
      metal_type: process.metal_type,
      category: process.category || sizeOptions[process.metal_type][0],
      issue_size:
        process.metal_type === "Silver"
          ? parseFloat((process.return_weight / 1000).toFixed(10)).toString()
          : parseFloat(process.return_weight.toFixed(10)).toString(),
      issue_pieces: process.return_pieces || "",
      weight_unit: process.metal_type === "Silver" ? "kg" : "g",
      description: "",
      employee: user?.username || "",
    });
    setIsNextStep(true);
    setIsCreateModalOpen(true);
  };

  const openViewModal = (job_number) => {
    navigate(`/job-history/${job_number}`);
  };

  const handleCreateProcess = async (e) => {
    e.preventDefault();
    let weight = parseFloat(createForm.issue_size);
    if (createForm.weight_unit === "kg") weight *= 1000;

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
        category: createForm.category,
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

    if (!weight || weight <= 0) {
      triggerError();
      return showToast("Invalid weight", "error");
    }
    try {
      await startProcess(selectedProcess.stage, {
        process_id: selectedProcess.id,
        issued_weight: weight,
        issue_pieces: startForm.issue_pieces || 0,
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
    setEditForm({
      issued_weight: process.issued_weight
        ? parseFloat((process.issued_weight / div).toFixed(10)).toString()
        : "",
      return_weight:
        process.return_weight !== null && process.return_weight !== undefined
          ? parseFloat((process.return_weight / div).toFixed(10)).toString()
          : "",
      scrap_weight:
        process.scrap_weight !== null && process.scrap_weight !== undefined
          ? parseFloat((process.scrap_weight / div).toFixed(10)).toString()
          : "",
      issue_pieces: process.issue_pieces || "",
      return_pieces: process.return_pieces || "",
      weight_unit: isSil ? "kg" : "g",
      category: process.category || "",
      description: process.description || "",
      employee: process.employee || "",
    });
    setIsEditModalOpen(true);
  };

  const handleEditProcess = async (e) => {
    e.preventDefault();
    let issueW = parseFloat(editForm.issued_weight);
    if (!issueW || issueW <= 0) {
      triggerError();
      return showToast("Invalid issued weight", "error");
    }
    const isKg = editForm.weight_unit === "kg";
    if (isKg) issueW *= 1000;

    let payload = {
      issued_weight: issueW,
      issue_pieces: editForm.issue_pieces,
      category: editForm.category,
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
      let retW = parseFloat(editForm.return_weight) || 0;
      let scrW = parseFloat(editForm.scrap_weight) || 0;
      if (isKg) {
        retW *= 1000;
        scrW *= 1000;
      }
      payload.return_weight = retW;
      payload.scrap_weight = scrW;
      payload.return_pieces = editForm.return_pieces;
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
    setCompleteForm({
      return_weight: "",
      scrap_weight: "",
      return_pieces: "",
      weight_unit: process.metal_type === "Silver" ? "kg" : "g",
      description: process.description || "",
    });
    setIsCompleteModalOpen(true);
  };

  const handleCompleteProcess = async (e) => {
    e.preventDefault();
    const issW = parseFloat(selectedProcess.issued_weight);
    let retW = parseFloat(completeForm.return_weight) || 0;
    let scrW = parseFloat(completeForm.scrap_weight) || 0;

    if (completeForm.weight_unit === "kg") {
      retW *= 1000;
      scrW *= 1000;
    }

    const liveLoss = issW - retW - scrW;

    if (retW <= 0) {
      triggerError();
      return showToast("Return must be > 0", "error");
    }

    try {
      await completeProcess(selectedProcess.stage, {
        process_id: selectedProcess.id,
        return_weight: retW,
        scrap_weight: scrW,
        return_pieces: parseInt(completeForm.return_pieces) || 0,
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
    const stagePriority = { Rolling: 1, Press: 2, TPP: 3, Packing: 4 };
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

    return Object.values(jobMap).sort(
      (a, b) => new Date(b.date) - new Date(a.date),
    );
  };

  const latestProcesses = getLatestProcesses(processes);

  const filteredProcesses = latestProcesses.filter(
    (p) =>
      (p.job_number || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.job_name || "").toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const reqPieces = false;
  const issVal = selectedProcess
    ? parseFloat(selectedProcess.issued_weight) || 0
    : 0;
  let retVal = parseFloat(completeForm.return_weight) || 0;
  let scrVal = parseFloat(completeForm.scrap_weight) || 0;

  if (completeForm?.weight_unit === "kg") {
    retVal *= 1000;
    scrVal *= 1000;
  }
  const liveLoss = parseFloat((issVal - retVal - scrVal).toFixed(10));
  const isLossNegative = liveLoss < 0;

  const getAvailableJobNumbers = () => {
    let prevStage = "Rolling";
    if (createForm.stage === "TPP") prevStage = "Press";
    if (createForm.stage === "Packing") prevStage = "TPP";

    return [
      ...new Set(
        processes
          .filter((p) => p.stage === prevStage && p.status === "COMPLETED")
          .map((p) => p.job_number),
      ),
    ];
  };

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
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 shadow-lg active:scale-95 transition-all"
        >
          <PlusCircle size={20} />{" "}
          <span className="font-semibold">Create Process Job</span>
        </button>
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
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
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
              {filteredProcesses.map((p) => (
                <tr
                  key={`${p.stage}-${p.id}`}
                  onClick={() => openViewModal(p.job_number)}
                  className="hover:bg-blue-50/50 cursor-pointer border-b border-gray-50 transition-colors"
                >
                  <td className="p-4">
                    <div className="font-bold text-gray-800 text-base">
                      {p.job_number}
                    </div>
                    {p.employee && (
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
                    )}
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
                      {p.category}
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
                        {p.status === "COMPLETED" && p.stage !== "Packing" && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openNextStepModal(p);
                            }}
                            className="bg-blue-100 text-blue-700 px-2 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-200 active:scale-95 flex items-center justify-center gap-1 whitespace-nowrap"
                          >
                            <ArrowRightCircle size={14} /> Start Next Step
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
          {filteredProcesses.length === 0 && (
            <div className="p-8 text-center text-gray-400">
              No processes found.
            </div>
          )}
        </div>
      </div>

      {/* CREATE MODAL */}
      <Modal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        title="Create Process Job"
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
              {isNextStep ? (
                <input
                  type="text"
                  className="w-full bg-gray-100 border border-gray-200 py-2.5 px-3 rounded-lg font-bold text-gray-600 outline-none cursor-not-allowed"
                  value={createForm.stage}
                  readOnly
                />
              ) : (
                <select
                  className="w-full bg-blue-50 border border-blue-200 py-2.5 px-3 rounded-lg font-bold outline-none text-blue-800"
                  value={createForm.stage || "Rolling"}
                  onChange={(e) => {
                    const newStage = e.target.value;
                    let nextJobNum = createForm.job_number;
                    if (newStage === "Rolling") {
                      nextJobNum = createForm.original_next_job;
                    } else {
                      let prevStage = "Rolling";
                      if (newStage === "TPP") prevStage = "Press";
                      if (newStage === "Packing") prevStage = "TPP";
                      const available = [
                        ...new Set(
                          processes
                            .filter(
                              (p) =>
                                p.stage === prevStage &&
                                p.status === "COMPLETED",
                            )
                            .map((p) => p.job_number),
                        ),
                      ];
                      nextJobNum = available.length > 0 ? available[0] : "";
                    }

                    const parentJob = processes.find(
                      (p) => p.job_number === nextJobNum,
                    );

                    setCreateForm({
                      ...createForm,
                      stage: newStage,
                      job_number: nextJobNum || "",
                      ...(parentJob && newStage !== "Rolling"
                        ? {
                            metal_type: parentJob.metal_type,
                            category: parentJob.category,
                            weight_unit:
                              parentJob.metal_type === "Silver" ? "kg" : "g",
                          }
                        : {}),
                    });
                  }}
                >
                  <option value="Rolling">Rolling</option>
                  <option value="Press">Press</option>
                  <option value="TPP">TPP</option>
                  <option value="Packing">Packing</option>
                </select>
              )}
            </div>

            <div className="col-span-1">
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                Job Number
              </label>
              {isNextStep || createForm.stage === "Rolling" ? (
                <input
                  type="text"
                  className="w-full bg-gray-100 border border-gray-200 py-2.5 px-3 rounded-lg font-mono text-blue-800 font-bold outline-none cursor-not-allowed"
                  value={createForm.job_number}
                  readOnly
                />
              ) : (
                <select
                  className="w-full bg-blue-50 border border-blue-200 py-2.5 px-3 rounded-lg font-mono text-blue-800 font-bold outline-none uppercase"
                  value={createForm.job_number || ""}
                  onChange={(e) => {
                    const jn = e.target.value;
                    const parentJob = processes.find(
                      (p) => p.job_number === jn,
                    );
                    if (parentJob) {
                      setCreateForm({
                        ...createForm,
                        job_number: jn,
                        metal_type: parentJob.metal_type,
                        category: parentJob.category,
                        weight_unit:
                          parentJob.metal_type === "Silver" ? "kg" : "g",
                      });
                    } else {
                      setCreateForm({
                        ...createForm,
                        job_number: jn,
                      });
                    }
                  }}
                  required
                >
                  <option value="" disabled>
                    Select Job
                  </option>
                  {getAvailableJobNumbers().map((jn) => (
                    <option key={jn} value={jn}>
                      {jn}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="col-span-1">
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                Metal
              </label>
              {isNextStep || createForm.stage !== "Rolling" ? (
                <input
                  type="text"
                  className="w-full bg-gray-100 border border-gray-200 py-2.5 px-3 rounded-lg font-bold text-gray-600 outline-none cursor-not-allowed"
                  value={createForm.metal_type}
                  readOnly
                />
              ) : (
                <select
                  className="w-full bg-gray-50 border border-gray-200 py-2.5 px-3 rounded-lg font-bold outline-none"
                  value={createForm.metal_type}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      metal_type: e.target.value,
                      category: sizeOptions[e.target.value][0],
                      weight_unit: e.target.value === "Silver" ? "kg" : "g",
                    })
                  }
                >
                  <option value="Gold">Gold</option>
                  <option value="Silver">Silver</option>
                </select>
              )}
            </div>

            <div className="col-span-1">
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                Category
              </label>
              <select
                className="w-full bg-gray-50 border border-gray-200 py-2.5 px-3 rounded-lg font-bold outline-none"
                value={createForm.category}
                onChange={(e) =>
                  setCreateForm({
                    ...createForm,
                    category: e.target.value,
                  })
                }
              >
                {sizeOptions[createForm.metal_type]?.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div className="col-span-1">
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
            </div>

            <div className="col-span-1">
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                Issue Size (Previous Pool)
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

            <div className="col-span-2">
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                Assigned Employee
              </label>
              <select
                className="w-full bg-blue-50/50 border border-blue-200 py-2.5 px-3 rounded-lg font-bold text-blue-900 outline-none focus:border-blue-500 transition-colors cursor-pointer"
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
            </div>

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
                className="w-full bg-white border border-yellow-300 py-2.5 px-3 rounded-lg font-bold text-lg text-yellow-900 outline-none focus:border-orange-500 transition-colors"
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
                className="w-full bg-white border border-yellow-300 py-2 px-3 text-sm rounded-lg outline-none focus:border-orange-500 min-h-20 transition-colors"
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <div className="col-span-1 bg-indigo-50 px-4 py-3 rounded-lg border border-indigo-100 flex justify-between items-center h-full">
              <span className="text-xs font-bold text-indigo-700 uppercase tracking-wide">
                Category
              </span>
              <span className="text-sm font-black text-indigo-900">
                {selectedProcess?.category || "N/A"}
              </span>
            </div>

            <div className="col-span-1">
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
                Weight Unit
              </label>
              <div className="flex bg-gray-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() =>
                    setCompleteForm({ ...completeForm, weight_unit: "g" })
                  }
                  className={`flex-1 py-1.5 text-sm font-bold rounded-md transition-colors ${completeForm?.weight_unit === "g" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  Grams (g)
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setCompleteForm({ ...completeForm, weight_unit: "kg" })
                  }
                  className={`flex-1 py-1.5 text-sm font-bold rounded-md transition-colors ${completeForm?.weight_unit === "kg" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                >
                  Kilogram (kg)
                </button>
              </div>
            </div>

            <div className="col-span-1">
              <label className="block text-xs font-bold text-green-700 mb-1.5 uppercase">
                Good Output
              </label>
              <input
                type="number"
                step="0.001"
                required
                className="w-full bg-green-50 border border-green-200 py-2.5 px-3 rounded-lg font-bold text-lg outline-none"
                value={completeForm.return_weight}
                onChange={(e) =>
                  setCompleteForm({
                    ...completeForm,
                    return_weight: e.target.value,
                  })
                }
                placeholder="0.000"
              />
            </div>

            <div className="col-span-1">
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase">
                Scrap/Dust
              </label>
              <input
                type="number"
                step="0.001"
                className="w-full bg-gray-50 border border-gray-200 py-2.5 px-3 rounded-lg font-bold text-lg outline-none"
                value={completeForm.scrap_weight}
                onChange={(e) =>
                  setCompleteForm({
                    ...completeForm,
                    scrap_weight: e.target.value,
                  })
                }
                placeholder="0.000"
              />
            </div>

            <div className="col-span-1 flex flex-col gap-4">
              <div>
                <label className="block text-xs font-bold text-purple-700 mb-1.5 uppercase">
                  Final Pieces {reqPieces ? "" : "(Optional)"}
                </label>
                <input
                  type="number"
                  step="1"
                  required={reqPieces}
                  className="w-full bg-purple-50 border border-purple-200 py-2.5 px-3 rounded-lg font-bold text-lg outline-none"
                  value={completeForm.return_pieces}
                  onChange={(e) =>
                    setCompleteForm({
                      ...completeForm,
                      return_pieces: e.target.value,
                    })
                  }
                  placeholder={reqPieces ? "0" : "0 (Optional)"}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase">
                  Description / Notes (Optional)
                </label>
                <textarea
                  className="w-full bg-gray-50 border border-gray-200 py-2 px-3 rounded-lg outline-none focus:border-blue-500 min-h-20 text-sm"
                  value={completeForm.description || ""}
                  onChange={(e) =>
                    setCompleteForm({
                      ...completeForm,
                      description: e.target.value,
                    })
                  }
                  placeholder="Add completion notes or issues..."
                />
              </div>
            </div>

            <div className="col-span-1 flex flex-col justify-end">
              <div className="bg-gray-800 text-gray-200 p-4 rounded-xl font-mono shadow-inner h-full flex flex-col justify-center gap-1.5">
                <div className="flex justify-between text-sm">
                  <span>Issued ({completeForm?.weight_unit || "g"}):</span>
                  <span>
                    {parseFloat(
                      (
                        issVal / (completeForm?.weight_unit === "kg" ? 1000 : 1)
                      ).toFixed(10),
                    )}
                  </span>
                </div>
                <div className="flex justify-between text-sm text-green-400">
                  <span>- Return:</span>
                  <span>
                    {parseFloat(
                      (
                        retVal / (completeForm?.weight_unit === "kg" ? 1000 : 1)
                      ).toFixed(10),
                    )}
                  </span>
                </div>
                <div className="flex justify-between text-sm text-yellow-400 mb-2">
                  <span>- Scrap:</span>
                  <span>
                    {parseFloat(
                      (
                        scrVal / (completeForm?.weight_unit === "kg" ? 1000 : 1)
                      ).toFixed(10),
                    )}
                  </span>
                </div>
                <div className="border-t border-gray-600 pt-3 flex justify-between font-bold text-lg">
                  <span>{isLossNegative ? "Gain:" : "Loss:"}</span>
                  <span
                    className={isLossNegative ? "text-green-400" : "text-white"}
                  >
                    {isLossNegative ? "+" : ""}
                    {parseFloat(
                      (
                        Math.abs(liveLoss) /
                        (completeForm?.weight_unit === "kg" ? 1000 : 1)
                      ).toFixed(10),
                    )}
                  </span>
                </div>
              </div>
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
                Category
              </label>
              <select
                className="w-full bg-gray-50 border border-gray-200 py-2.5 px-3 rounded-lg font-semibold outline-none"
                value={editForm.category}
                onChange={(e) =>
                  setEditForm({ ...editForm, category: e.target.value })
                }
              >
                {sizeOptions[selectedProcess?.metal_type]?.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

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

            <div className="col-span-2">
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
            </div>

            {selectedProcess?.status === "COMPLETED" ||
            selectedProcess?.status === "RUNNING" ? (
              <>
                <div className="col-span-1 border-l border-gray-200 pl-6 space-y-4 row-span-3">
                  <div>
                    <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-3">
                      Output Adjustments
                    </p>
                    <label className="block text-xs font-bold text-green-700 mb-1.5">
                      Return Weight
                    </label>
                    <input
                      type="number"
                      step="0.001"
                      className="w-full bg-green-50/50 border border-green-200 text-green-800 py-2.5 px-3 rounded-lg outline-none font-bold focus:border-green-400 transition-colors"
                      value={editForm.return_weight}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          return_weight: e.target.value,
                        })
                      }
                      placeholder="0.000"
                    />
                  </div>
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
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1.5">
                      Return Pieces{" "}
                      <span className="text-gray-400 font-normal">
                        (Optional)
                      </span>
                    </label>
                    <input
                      type="number"
                      className="w-full bg-gray-50 border border-gray-200 text-gray-700 py-2.5 px-3 rounded-lg outline-none font-bold focus:border-blue-500 transition-colors"
                      value={editForm.return_pieces}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          return_pieces: e.target.value,
                        })
                      }
                      placeholder="0"
                    />
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
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">
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
              </select>

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
