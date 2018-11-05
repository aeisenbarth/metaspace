import {FieldResolversFor, ProjectSource, UserProjectSource} from '../../../bindingTypes';
import {UserProject} from '../../../binding';
import {Context} from '../../../context';
import {ProjectSourceRepository} from '../ProjectSourceRepository';
import {UserError} from 'graphql-errors';
import {Dataset as DatasetModel} from '../../dataset/model';

const UserProjectResolvers: FieldResolversFor<UserProject, UserProjectSource> = {
  async project(userProject, args, ctx: Context): Promise<ProjectSource> {
    const project = await ctx.connection.getCustomRepository(ProjectSourceRepository)
      .findProjectById(ctx.user, userProject.projectId);

    if (project != null) {
      return project;
    } else {
      throw new UserError('Project not found');
    }
  },
  async numDatasets(userProject, args, { connection }: Context): Promise<number> {
    // NOTE: This number includes private datasets. It is only secure because we *currently* only resolve
    // `UserProjectSource`s when you are in the same project as the user, and thus allowed to see the private datasets
    // that are also in that project.
    // If this assumption changes, we'll have to consider whether showing a number that includes private datasets is a privacy breach.
    const { userId, projectId } = userProject;
    return await connection.getRepository(DatasetModel)
      .createQueryBuilder('dataset')
      .innerJoin('dataset.datasetProjects', 'datasetProject')
      .where('dataset.userId = :userId', { userId })
      .andWhere('datasetProject.projectId = :projectId', { projectId })
      .andWhere('datasetProject.approved = TRUE')
      .getCount();
  },
};

export default UserProjectResolvers;