import {BaseAction} from './BaseAction';
import {Config} from '../config';
import {Deployment} from '../Deployment';
import {Session} from '../Session';
import {SessionRunner} from '../Session';
import {SessionManager, SessionManagerConfig, SessionGroup, SessionsMap} from '../SessionManager';
import {SummaryMap,SummaryMapResult, SummaryMapHistory, haveSummaryMapsErrors, hasSummaryMapErrors, mergeSummaryMap} from "../SummaryMap";

const _ = require('underscore');

export interface LogsOptions {
  tail?: boolean;
  init?: string;
  onStdout: any;
  onStderr: any;
}

export class LogsAction extends BaseAction {

  protected runSite(deployment : Deployment, site : string, options : LogsOptions) : Promise<SummaryMap> {
      const siteConfig = this.getSiteConfig(site);
      const sessionsMap = this.createSiteSessionsMap(siteConfig);
      const groupPromises : Array<Promise<SummaryMap>> = _.map(sessionsMap, (sessionGroup : SessionGroup, os : string) => {
          const taskListsBuilder = this.createTaskBuilderByOs(sessionGroup);
          const sessionPromises : Array<Promise<SummaryMap>> = sessionGroup.sessions.map((session : Session) => {
              const hostPrefix = `(${site}) [${session._host}] `;
              const tasks = taskListsBuilder.logs(this.config, hostPrefix, options);
              const runner = new SessionRunner;
              return runner.execute(session, tasks, {});
          });
          return Promise.all(sessionPromises).then((summaryMaps : Array<SummaryMap>) => {
              return Promise.resolve(mergeSummaryMap(summaryMaps));
          });
      });
      return Promise.all(groupPromises).then((summaryMaps : Array<SummaryMap>) => {
          return Promise.resolve(mergeSummaryMap(summaryMaps));
      });
  }

  public run(deployment : Deployment, sites : Array<string>, options : LogsOptions) : Promise<SummaryMap> {
    const sitesPromise : Array<Promise<SummaryMap>> = _.map(sites, (site : string) => this.runSite(deployment, site, options));
    return Promise.all(sitesPromise).then((summaryMaps : Array<SummaryMap>) => {
      return Promise.resolve(mergeSummaryMap(summaryMaps));
    });
  }
}
