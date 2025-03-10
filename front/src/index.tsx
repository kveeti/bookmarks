/* @refresh reload */
import { render } from "solid-js/web";

import { Entry } from "./entry";
import "./styles.css";

render(() => <Entry />, document.getElementById("root")!);
