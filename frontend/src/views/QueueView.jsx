import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { getExtractionJobs } from '../services/api';
import Badge from '../components/Badge';
import useExtractionStore from '../store/extractionStore';

export default function QueueView() {
  const navigate = useNavigate();
  const { data: jobs = [], isLoading, error } = useQuery({
    queryKey: ['extractionJobs'],
    queryFn: getExtractionJobs,
    refetchInterval: 5000, // Poll every 5 seconds
    select: (d) => (Array.isArray(d) ? d : []),
  });

  const handleReview = (job) => {
    const fileMeta = {
      file_path: job.file_path,
      stored_name: job.file_path.split('/').pop(),
      name: job.original_filename
    };
    
    // Jump straight to the Review step in ExtractionView
    const store = useExtractionStore.getState();
    store.resetFlow();
    store.setFiles([fileMeta]);
    store.setFileStatuses(['done']);
    store.setFileResults([{
       fileMeta,
       extractedData: job.result_data,
       scriptData: null,
       finalFields: null,
       excluded: false
    }]);
    store.setStep(4);
    
    navigate('/extract');
  };

  if (isLoading) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading queue...</div>;
  }

  if (error) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--red)' }}>Failed to load queue.</div>;
  }

  const renderStatus = (job) => {
    switch (job.status) {
      case 'COMPLETED': return <Badge color="green">Ready for Review</Badge>;
      case 'PROCESSING': return <Badge color="blue">Processing</Badge>;
      case 'PENDING': return <Badge color="amber">In Queue</Badge>;
      case 'FAILED': return <Badge color="red">Failed</Badge>;
      default: return <Badge color="slate">{job.status}</Badge>;
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
      <h2 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>Extraction Queue</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: 24 }}>
        Files submitted for AI extraction appear here. You can close your laptop while files are processing.
      </p>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Filename</th>
                <th>Submitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>
                    Your queue is empty. Submit files from the Request tab.
                  </td>
                </tr>
              ) : (
                jobs.map(job => (
                  <tr key={job.job_id}>
                    <td>{renderStatus(job)}</td>
                    <td style={{ fontWeight: 500 }}>{job.original_filename || job.file_path.split('/').pop()}</td>
                    <td style={{ color: 'var(--text-faint)' }}>{new Date(job.created_at).toLocaleString()}</td>
                    <td>
                      {job.status === 'COMPLETED' && (
                        <button 
                          className="btn btn-outline" 
                          style={{ padding: '4px 12px', fontSize: 13 }}
                          onClick={() => handleReview(job)}
                        >
                          Review
                        </button>
                      )}
                      {job.status === 'FAILED' && (
                        <span style={{ fontSize: 12, color: 'var(--red)' }} title={job.error_message}>
                          See tooltip for error
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
