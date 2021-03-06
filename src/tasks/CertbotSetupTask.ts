import {Task} from "./Task";
import {SetupTask} from "./SetupTask";
import {Config} from "../config";
import {Session, SessionResult, executeScript, sync} from "../Session";
import {CertbotBaseTask} from "./CertbotBaseTask";

export class CertbotSetupTask extends CertbotBaseTask {

  public describe() : string {
    return 'Setting up certbot';
  }

  public run(session : Session) : Promise<SessionResult> {
    const options = { 'vars': this.extendArgs({
      'email':  this.email,
      'domain': this.domain,
    }) };
    return sync(
      (result : SessionResult) => executeScript(session, this.resolveScript(session, 'certbot/install.sh'), options),
      (result : SessionResult) => executeScript(session, this.resolveScript(session, 'certbot/genssl.sh'), options)
    );
  }
}
