import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Clock,
  History,
  CheckCircle,
  Activity,
  Box,
} from "lucide-react";
import { getCombinedProcesses } from "../api/jobService";

const JobHistory = () => {
  const { jobNumber } = useParams();
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    try {
      const result = await getCombinedProcesses();
      if (result.success) {
        let jobHistory = result.data.filter((p) => p.job_number === jobNumber);
        const stagePriority = { Rolling: 1, Press: 2, TPP: 3, Packing: 4 };
        jobHistory.sort(
          (a, b) => stagePriority[a.stage] - stagePriority[b.stage],
        );
        setHistory(jobHistory);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [jobNumber]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  if (loading)
    return (
      <div className="p-10 text-center animate-pulse">
        Loading Job Details...
      </div>
    );

  return (
    <div className="p-6 relative max-w-5xl mx-auto">
      <button
        onClick={() => navigate("/production")}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-800 font-bold mb-6 transition-colors"
      >
        <ArrowLeft size={20} /> Back to Production Floor
      </button>

      <div className="flex items-center gap-3 mb-8">
        <div className="bg-blue-100 p-3 rounded-xl text-blue-600">
          <History size={28} />
        </div>
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
            Timeline: {jobNumber}
          </h1>
          <p className="text-gray-500 font-medium">
            Complete Stage Progression History
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        {history.length === 0 ? (
          <div className="p-10 text-center text-gray-500">
            No historical records found for this Job Number.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-sm uppercase tracking-wider relative">
                  <th className="p-5 font-bold border-b border-gray-100">
                    Stage
                  </th>
                  <th className="p-5 font-bold border-b border-gray-100">
                    Status
                  </th>
                  <th className="p-5 font-bold border-b border-gray-100">
                    Updated Date
                  </th>
                  <th className="p-5 font-bold border-b border-gray-100">
                    Issue Weight
                  </th>
                  <th className="p-5 font-bold border-b border-gray-100">
                    Return Weight
                  </th>
                  <th className="p-5 font-bold border-b border-gray-100">
                    Scrap Weight
                  </th>
                  <th className="p-5 font-bold border-b border-gray-100 text-red-500">
                    Loss
                  </th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, index) => (
                  <tr
                    key={`${h.stage}-${h.id}`}
                    className="hover:bg-gray-50 transition-colors border-b border-gray-50"
                  >
                    <td className="p-5 font-bold text-gray-800 flex items-center gap-2">
                      <span className="bg-gray-200 text-gray-700 w-6 h-6 flex items-center justify-center rounded-full text-xs">
                        {index + 1}
                      </span>
                      {h.stage}
                    </td>
                    <td className="p-5">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1 w-max ${h.status === "PENDING" ? "bg-orange-50 text-orange-700 border-orange-200" : h.status === "RUNNING" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-green-50 text-green-700 border-green-200"}`}
                      >
                        {h.status === "COMPLETED" ? (
                          <CheckCircle size={12} />
                        ) : h.status === "RUNNING" ? (
                          <Activity size={12} />
                        ) : (
                          <Clock size={12} />
                        )}
                        {h.status}
                      </span>
                    </td>
                    <td className="p-5 text-gray-500 text-sm">
                      {new Date(h.date).toLocaleDateString()}{" "}
                      {new Date(h.date).toLocaleTimeString()}
                    </td>
                    <td className="p-5 font-black text-gray-700">
                      {h.issued_weight
                        ? h.issued_weight.toFixed(3)
                        : (h.issue_size || 0).toFixed(3)}
                      g
                    </td>
                    <td className="p-5 font-black text-green-600">
                      {h.return_weight ? h.return_weight.toFixed(3) + "g" : "-"}
                    </td>
                    <td className="p-5 font-black text-gray-600">
                      {h.scrap_weight ? h.scrap_weight.toFixed(3) + "g" : "-"}
                    </td>
                    <td className="p-5 font-black text-red-500">
                      {h.loss_weight ? h.loss_weight.toFixed(3) + "g" : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default JobHistory;
