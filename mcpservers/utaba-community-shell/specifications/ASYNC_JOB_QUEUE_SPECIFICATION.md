# Async Job Queue Approval System - Feature Specification

## 🎯 **Overview**

This specification defines an asynchronous job queue system for the MCP Shell approval workflow. The system decouples command approval from MCP protocol timeouts, enabling long-running approvals and commands while maintaining responsive user experience.

## 🏗️ **Architecture**

### **Current Problem**
- MCP calls timeout after ~2-3 minutes
- Approval system allows 5-minute decisions
- Commands can run for 10+ minutes (npm installs, builds)
- Results in "zombie executions" and poor UX

### **Proposed Solution**
Replace synchronous approval workflow with asynchronous job queue:

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Request   │    │    Job      │    │  Approval   │    │   Result    │
│  Submitted  │───▶│   Created   │───▶│  Decision   │───▶│ Execution   │
│             │    │             │    │             │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
     Instant            Queue           Human Wait         Long Running
    Response           Persist         (5+ minutes)       (10+ minutes)
```

## 🔧 **New MCP Tools**

### **1. mcp_shell_execute_command_async**
**Purpose**: Submit command for approval/execution and receive immediate job ID

**Input**:
```typescript
{
  command: string;
  args: string[];
  workingDirectory?: string;
  timeout?: number;
}
```

**Output**:
```typescript
{
  jobId: string;                    // Unique job identifier
  status: "pending_approval";       // Initial status
  submittedAt: number;             // Unix timestamp
  estimatedApprovalTime?: number;   // Expected approval timeout
}
```

### **2. mcp_shell_check_job_status**
**Purpose**: Poll job status and get progress updates

**Input**:
```typescript
{
  jobId: string;
}
```

**Output**:
```typescript
{
  jobId: string;
  status: JobStatus;               // See status enum below
  submittedAt: number;
  lastUpdated: number;
  timeElapsed: number;
  estimatedTimeRemaining?: number;
  progressMessage?: string;        // Human-readable status
  executionToken?: string;         // Only present when status = "completed"
  error?: string;                  // Only present when status = "failed"
  approvalUrl?: string;           // Browser URL for pending approvals
}
```

### **3. mcp_shell_get_job_result**
**Purpose**: Retrieve command execution results using secure token

**Input**:
```typescript
{
  jobId: string;
  executionToken: string;          // Prevents replay attacks
}
```

**Output**:
```typescript
{
  success: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  executionTime: number;
  timedOut: boolean;
  killed: boolean;
  pid?: number;
  completedAt: number;
}
```

### **4. mcp_shell_list_jobs** *(Optional)*
**Purpose**: List recent jobs for debugging/monitoring

**Input**:
```typescript
{
  status?: JobStatus;              // Filter by status
  limit?: number;                  // Max results (default: 10)
}
```

**Output**:
```typescript
{
  jobs: JobSummary[];
  total: number;
}
```

### **5. mcp_shell_check_conversation_jobs** *(New)*
**Purpose**: Check status of all jobs submitted in current conversation

**Input**:
```typescript
{
  includeCompleted?: boolean;      // Include finished jobs (default: true)
}
```

**Output**:
```typescript
{
  activeJobs: JobSummary[];        // Currently running or pending
  recentlyCompleted: JobSummary[]; // Finished since last check
  pendingResults: JobSummary[];    // Results ready for retrieval
}
```

## 📊 **Job Status Enum**

```typescript
type JobStatus = 
  | "pending_approval"    // Waiting for human decision in browser
  | "approved"           // Human approved, queued for execution
  | "executing"          // Command currently running
  | "completed"          // Execution finished, results available
  | "rejected"           // Human rejected the command
  | "approval_timeout"   // Approval decision timed out
  | "execution_timeout"  // Command execution timed out
  | "execution_failed"   // Command failed to execute
  | "cancelled"          // Job was manually cancelled
  | "expired";           // Job results expired (after 24h)
```

## 🕐 **Adaptive Polling Strategy**

### **Time-Based Polling Intervals**
```typescript
function getPollingInterval(job: JobRecord): number {
  const elapsed = Date.now() - job.submittedAt;
  const status = job.status;
  
  if (status === "pending_approval") {
    if (elapsed < 2 * 60 * 1000) return 10000;      // 10s for first 2 min
    return 30000;                                    // 30s after that
  }
  
  if (status === "executing") {
    if (elapsed < 10 * 60 * 1000) return 120000;    // 2min for first 10 min
    if (elapsed < 60 * 60 * 1000) return 300000;    // 5min for first hour
    return 900000;                                   // 15min for long jobs
  }
  
  return 60000; // Default 1 minute
}
```

### **Polling Behavior by Operation Type**

| Operation Type | Initial Interval | After 10min | After 1hr | Max Duration |
|---------------|------------------|--------------|-----------|--------------|
| **Approval Wait** | 10s | 30s | 30s | 5 minutes |
| **Package Install** | 2min | 5min | 15min | 30 minutes |
| **Build/Compile** | 2min | 5min | 15min | 2 hours |
| **Docker Build** | 3min | 10min | 15min | 4 hours |
| **Test Suite** | 30s | 2min | 5min | 1 hour |

## 🧠 **Conversation Context Management**

### **Context Tracking**
```typescript
interface ConversationContext {
  sessionId: string;               // Unique conversation identifier
  activeJobs: string[];           // Jobs submitted in this chat
  lastJobCheck: number;           // When we last checked all jobs
  userExpectations: {             // What user is waiting for
    jobId: string;
    description: string;
    estimatedCompletion?: number;
    notifyOnCompletion: boolean;
  }[];
  pausedPolling: string[];        // Jobs we stopped checking
}
```

### **Session Resumption Logic**
1. **On conversation start**: Check for any active jobs from previous session
2. **Auto-check timing**: If > 30 minutes since last check, proactively check all active jobs
3. **Smart notifications**: Announce completed jobs that user was waiting for
4. **Context preservation**: Remember what each job was meant to accomplish

## 🎭 **User Experience Patterns**

### **Short Operations (< 5 minutes)**
```
Claude: "I'll submit the command for approval..."
→ mcp_shell_execute_command_async()
Claude: "Approval request submitted (Job ID: job_123). Checking status..."
→ Poll every 10s for first 2 minutes, then 30s
Claude: "Still waiting for approval... (2m 30s elapsed)"
Claude: "Command approved! Executing now..."
Claude: "Command completed successfully! Here are the results..."
→ mcp_shell_get_job_result()
```

### **Long Operations (hours)**
```
Claude: "I'll submit the Docker build for approval..."
→ mcp_shell_execute_command_async()
Claude: "Build job submitted (Job ID: job_456). This will take a while - I'll:"
• Check status every few minutes initially
• Then every 10-15 minutes during execution
• You can ask me about other things while we wait
• I'll proactively update you when it completes

→ Poll every 3 minutes for first 10 minutes
→ Poll every 10-15 minutes after approval
Claude: "Job approved and building... (45 minutes elapsed, still running)"
Claude: "I'll check back periodically. Feel free to ask me about other things!"
```

### **Conversation Resumption (after hours away)**
```
You: "Hi Claude" [returns after 3 hours]
Claude: "Welcome back! I have updates on jobs we started earlier:"

→ mcp_shell_check_conversation_jobs()

• ✅ Docker build (job_456): Completed successfully (finished 47 minutes ago)
• ⏳ Test suite (job_789): Still running (2h 15m elapsed, estimated 30m remaining)
• 📝 Build results ready for review

"Would you like me to show the Docker build output first?"
```

### **Multitasking During Long Jobs**
```
Claude: "The build is running in the background (job_456). What else can I help with?"
You: "Can you help me write a README?"
Claude: "Absolutely! Let me help with the README..."
[30 minutes later]
Claude: "By the way, that Docker build just completed! The README looks great too."
```

## 🗂️ **Data Storage**

### **Job Record Structure**
```typescript
interface JobRecord {
  // Identity
  id: string;                      // UUID v4
  conversationId?: string;         // Link to conversation context
  
  // Request Details
  command: string;
  args: string[];
  workingDirectory: string;
  requestedTimeout: number;
  estimatedDuration?: number;      // Expected execution time
  operationType?: string;          // "build", "install", "test", etc.
  
  // Timestamps
  submittedAt: number;
  lastUpdated: number;
  approvedAt?: number;
  startedAt?: number;
  completedAt?: number;
  lastPolledAt?: number;           // When Claude last checked
  
  // Status & Progress
  status: JobStatus;
  progressMessage?: string;
  progressPercentage?: number;     // 0-100 if determinable
  
  // Security
  executionToken?: string;         // Generated after completion
  decidedBy?: string;              // Who approved/rejected
  
  // Results (stored separately for large outputs)
  resultPath?: string;             // Path to result file
  exitCode?: number;
  executionTime?: number;
  timedOut?: boolean;
  killed?: boolean;
  pid?: number;
  
  // Metadata
  riskScore?: number;
  riskFactors?: string[];
  approvalUrl?: string;
  
  // Context
  userDescription?: string;        // What user was trying to accomplish
  nextPollingInterval?: number;    // Dynamic polling adjustment
  maxPollingDuration?: number;     // When to stop auto-polling
}
```

### **File Structure**
```
approval-queue/
├── jobs/
│   ├── pending/                 # Jobs awaiting approval
│   ├── approved/               # Jobs ready for execution
│   ├── executing/              # Jobs currently running
│   ├── completed/              # Finished jobs (24h retention)
│   └── archived/               # Old jobs (compressed)
├── results/
│   ├── job_123_stdout.txt      # Large stdout files
│   ├── job_123_stderr.txt      # Large stderr files
│   └── job_123_metadata.json   # Execution metadata
├── conversations/
│   ├── session_abc.json        # Conversation context
│   └── session_def.json        # Multiple conversation tracking
└── manifest.json               # Queue statistics
```

## 🔄 **Workflow States**

### **1. Job Submission**
```
User: mcp_shell_execute_command_async("npx", ["create-react-app", "my-app"])
→ Create job record in jobs/pending/
→ Update approval queue manifest
→ Track job in conversation context
→ Start approval server if needed
→ Return: { jobId: "job_123", status: "pending_approval" }
```

### **2. Intelligent Status Polling**
```
User: mcp_shell_check_job_status("job_123")
→ Read job record from filesystem
→ Calculate next polling interval based on status and elapsed time
→ Update lastPolledAt timestamp
→ Return current status with intelligent progress message
```

### **3. Approval Decision**
```
Human clicks "Approve" in browser:
→ Move job from jobs/pending/ to jobs/approved/
→ Generate execution token
→ Update job status and timestamps
→ Queue for execution
→ Trigger immediate status check if Claude is polling
```

### **4. Background Command Execution**
```
Background worker:
→ Move job from jobs/approved/ to jobs/executing/
→ Execute command with full logging
→ Stream output to result files
→ Update job status and progress periodically
→ Move to jobs/completed/ when done
→ Notify any active polling sessions
```

### **5. Conversation-Aware Result Retrieval**
```
User returns to conversation:
→ mcp_shell_check_conversation_jobs()
→ Identify completed jobs since last session
→ Proactively offer to show results
→ User: mcp_shell_get_job_result("job_123", "token_abc")
→ Validate execution token and conversation context
→ Return formatted results with context
```

## ⏱️ **Timeout Handling**

### **Approval Timeouts**
- **Default**: 5 minutes for approval decision
- **Configurable**: Per-command timeout settings
- **Action**: Move to `approval_timeout` status
- **Cleanup**: Archive expired approval requests
- **Notification**: Stop polling and notify if conversation active

### **Execution Timeouts**
- **Default**: Inherit from command configuration
- **Maximum**: Varies by operation type (30min to 4hrs)
- **Action**: Kill process, set `execution_timeout` status
- **Cleanup**: Save partial results if available
- **Notification**: Immediate notification to active conversations

### **Polling Timeouts**
- **Default**: Stop auto-polling after reasonable duration
- **Triggers**: No status change for extended period
- **Action**: Set polling to "manual" mode
- **Recovery**: Resume polling on explicit status check

### **Result Expiration**
- **Default**: 24 hours result retention
- **Action**: Move completed jobs to archive
- **Cleanup**: Compress results, keep metadata
- **Grace Period**: 7 days before permanent deletion

## 🔒 **Security Considerations**

### **Execution Tokens**
- **Format**: 64-character hex string (crypto.randomBytes(32))
- **Purpose**: Prevent replay attacks and unauthorized result access
- **Lifecycle**: Generated after completion, expires with job
- **Validation**: Required for result retrieval
- **Conversation Binding**: Tied to specific conversation context

### **Job Isolation**
- **Filesystem**: Each job in separate directory
- **Process**: Isolated execution environment
- **Logging**: Complete audit trail
- **Cleanup**: Secure deletion of sensitive data
- **Context Isolation**: Jobs scoped to conversation sessions

### **Access Control**
- **Job Ownership**: Jobs tied to MCP session and conversation
- **Result Access**: Token-based authorization with conversation validation
- **Approval UI**: Existing token authentication
- **Admin Tools**: Separate admin interface (future)
- **Cross-Session Protection**: Prevent access to other users' jobs

## 📊 **Monitoring & Observability**

### **Queue Metrics**
- Jobs by status (pending, executing, completed)
- Average approval time by operation type
- Average execution time with trend analysis
- Success/failure rates with categorization
- Resource utilization and performance metrics

### **Conversation Metrics**
- Active conversations with pending jobs
- Job completion notification success rates
- Polling efficiency and resource usage
- User satisfaction with timing predictions

### **Performance Metrics**
- Queue processing latency by operation type
- File I/O performance under load
- Memory usage patterns during long jobs
- Disk space utilization and cleanup effectiveness

### **Health Checks**
- Queue processor status and responsiveness
- Approval server health and connectivity
- File system accessibility and permissions
- Process management status and resource limits
- Conversation context persistence and recovery

## 🚀 **Implementation Phases**

### **Phase 1: Core Infrastructure**
- [ ] Job record data structures with conversation context
- [ ] File-based queue system with session tracking
- [ ] Basic status management and polling logic
- [ ] Execution token generation and validation

### **Phase 2: MCP Integration**
- [ ] New async MCP tools with conversation awareness
- [ ] Intelligent status polling mechanism
- [ ] Result retrieval system with context validation
- [ ] Comprehensive error handling and recovery

### **Phase 3: Background Processing**
- [ ] Job queue processor with progress tracking
- [ ] Command execution engine with output streaming
- [ ] Adaptive polling interval calculation
- [ ] Timeout management and cleanup automation

### **Phase 4: Conversation Intelligence**
- [ ] Session resumption and context restoration
- [ ] Proactive job completion notifications
- [ ] Multi-job coordination and status aggregation
- [ ] Smart polling pause/resume logic

### **Phase 5: UI Enhancement**
- [ ] Real-time job status in approval UI
- [ ] Progress indicators with time estimates
- [ ] Job history view with conversation context
- [ ] Admin monitoring tools and analytics dashboard

### **Phase 6: Production Features**
- [ ] Job persistence across server restarts
- [ ] Result compression and intelligent archiving
- [ ] Performance optimization and resource management
- [ ] Comprehensive testing and load validation

## 🧪 **Testing Strategy**

### **Unit Tests**
- Job creation and state transitions with conversation context
- Token generation, validation, and expiration handling
- File operations, cleanup, and session persistence
- Adaptive polling logic and interval calculation

### **Integration Tests**
- End-to-end approval workflow with conversation resumption
- MCP tool interactions across multiple sessions
- Browser UI integration with session management
- Concurrent job handling and resource contention

### **Performance Tests**
- High-volume job processing with multiple conversations
- Large output handling and streaming performance
- Long-running command execution under load
- Memory usage and resource cleanup effectiveness

### **User Experience Tests**
- Conversation resumption after various time intervals
- Polling behavior validation across different job types
- Notification timing and accuracy testing
- Multi-job coordination and status aggregation

### **Security Tests**
- Token validation and conversation scope enforcement
- Unauthorized access attempts across sessions
- File permission verification and isolation testing
- Process isolation validation and resource limits

## 📋 **Migration Plan**

### **Backward Compatibility**
- Keep existing synchronous tools during transition period
- Gradual migration of approval-required commands to async model
- Feature flag for async vs sync behavior per command type
- Clear deprecation timeline with user communication

### **Data Migration**
- Convert existing approval records to job format with context
- Preserve approval statistics, history, and user preferences
- Migrate configuration settings and timeout values
- Update documentation, examples, and user guides

### **Rollout Strategy**
- Alpha: Internal testing with select command types
- Beta: Limited user group with feedback collection
- Production: Gradual rollout with monitoring and rollback capability
- Full deployment: Complete migration with legacy system retirement

## 🎯 **Success Criteria**

- ✅ **No MCP timeouts** for approval workflows of any duration
- ✅ **Support 4+ hour** command executions (Docker builds, large test suites)
- ✅ **Responsive UI** with real-time updates and progress indicators
- ✅ **100% approval decision** accuracy with zero zombie executions
- ✅ **Intelligent conversation** resumption with context preservation
- ✅ **Efficient resource usage** with smart polling and cleanup
- ✅ **Complete audit trail** for all operations and decisions
- ✅ **Production-ready** reliability, performance, and scalability

---

**This specification provides a robust, scalable foundation for enterprise-grade approval workflows with intelligent conversation management, while maintaining the security and user experience principles of the original design.**
