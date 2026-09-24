import { collection } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { cleanFirestoreData } from "./projectService";
import { syncAddDoc } from "./firestoreSync";

/**
 * Logs a user activity to the global activity stream in Firestore.
 */
export const logActivity = async (
  userEmail: string, 
  userName: string, 
  action: string, 
  projectId: string, 
  projectName: string
) => {
  const path = "activities";
  try {
    await syncAddDoc(collection(db, path), cleanFirestoreData({
      userEmail,
      userName,
      action,
      projectId,
      projectName,
      timestamp: new Date().toISOString()
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
};