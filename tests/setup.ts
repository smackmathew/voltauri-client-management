import { setLogLevel } from "firebase/firestore";

// Many tests expect writes to be rejected; don't log each rejection.
setLogLevel("silent");
