import {createTestDataset, createTestProject, createTestProjectMember} from '../../../tests/testDataCreation';
import {UserProjectRole} from '../../../binding';
import {Project as ProjectModel, UserProject as UserProjectModel, UserProjectRoleOptions as UPRO} from '../model';
import {User as UserModel} from '../../user/model';
import {
  doQuery,
  onAfterAll,
  onAfterEach,
  onBeforeAll,
  onBeforeEach,
  setupTestUsers,
  testEntityManager,
  testUser, userContext,
} from '../../../tests/graphqlTestEnvironment';
import getContext from '../../../getContext';
import {BackgroundData, createBackgroundData, validateBackgroundData} from '../../../tests/backgroundDataCreation';
import {DatasetProject as DatasetProjectModel} from '../../dataset/model';
import {In} from 'typeorm';
import {Context} from '../../../context';
import * as auth from '../../auth';
import * as projectEmails from '../email';
import {createUserCredentials, verifyEmail} from '../../auth/operation';


describe('modules/project/controller (membership-related mutations)', () => {
  let userId: string;

  beforeAll(onBeforeAll);
  afterAll(onAfterAll);
  beforeEach(async () => {
    await onBeforeEach();
    await setupTestUsers();
    userId = testUser.id;
  });
  afterEach(onAfterEach);

  describe('Mutations for joining/leaving projects', () => {
    const leaveProjectQuery = `mutation ($projectId: ID!) { leaveProject(projectId: $projectId) }`;
    const removeUserFromProjectQuery = `mutation ($projectId: ID!, $userId: ID!) { removeUserFromProject(projectId: $projectId, userId: $userId) }`;
    const requestAccessToProjectQuery = `mutation ($projectId: ID!) { requestAccessToProject(projectId: $projectId) { role } }`;
    const acceptRequestToJoinProjectQuery = `mutation ($projectId: ID!, $userId: ID!) { acceptRequestToJoinProject(projectId: $projectId, userId: $userId) { role } }`;
    const inviteUserToProjectQuery = `mutation ($projectId: ID!, $email: String!) { inviteUserToProject(projectId: $projectId, email: $email) { role } }`;
    const acceptProjectInvitationQuery = `mutation ($projectId: ID!) { acceptProjectInvitation(projectId: $projectId) { role } }`;

    let project: ProjectModel;
    let projectId: string;
    let manager: UserModel;
    let managerContext: Context;
    let bgData: BackgroundData;

    beforeEach(async () => {
      project = await createTestProject();
      projectId = project.id;
      manager = await createTestProjectMember(projectId, UPRO.MANAGER);
      managerContext = getContext(manager as any, testEntityManager);
      bgData = await createBackgroundData({
        datasetsForProjectIds: [projectId],
        datasetsForUserIds: [userId, manager.id],
      });
    });
    afterEach(async () => {
      await validateBackgroundData(bgData);
    });


    test('User requests access, is accepted, leaves', async () => {
      const requestAccessEmailSpy = jest.spyOn(projectEmails, 'sendRequestAccessToProjectEmail');
      const acceptanceEmailSpy = jest.spyOn(projectEmails, 'sendProjectAcceptanceEmail');
      await doQuery(requestAccessToProjectQuery, {projectId});
      expect(await testEntityManager.findOne(UserProjectModel, {projectId, userId}))
        .toEqual(expect.objectContaining({ role: UPRO.PENDING }));
      expect(requestAccessEmailSpy).toHaveBeenCalledTimes(1);
      expect(requestAccessEmailSpy)
        .toHaveBeenCalledWith(
          expect.objectContaining({id: manager.id}),
          expect.objectContaining({id: userId}),
          expect.objectContaining({id: projectId}));

      await doQuery(acceptRequestToJoinProjectQuery, {projectId, userId}, {context: managerContext});
      expect(await testEntityManager.findOne(UserProjectModel, {projectId, userId}))
        .toEqual(expect.objectContaining({ role: UPRO.MEMBER }));
      expect(acceptanceEmailSpy).toHaveBeenCalledTimes(1);
      expect(acceptanceEmailSpy)
        .toHaveBeenCalledWith(expect.objectContaining({id: userId}), expect.objectContaining({id: projectId}));

      await doQuery(leaveProjectQuery, {projectId});
      expect(await testEntityManager.findOne(UserProjectModel, {projectId, userId}))
        .toEqual(undefined);
    });

    test('User requests access, is rejected', async () => {
      await doQuery(requestAccessToProjectQuery, {projectId});
      expect(await testEntityManager.findOne(UserProjectModel, {projectId, userId}))
        .toEqual(expect.objectContaining({ role: UPRO.PENDING }));

      await doQuery(removeUserFromProjectQuery, {projectId, userId}, {context: managerContext});
      expect(await testEntityManager.findOne(UserProjectModel, {projectId, userId}))
        .toEqual(undefined);
    });

    test('Manager invites user, user accepts, manager removes user from group', async () => {
      const invitationEmailSpy = jest.spyOn(projectEmails, 'sendProjectInvitationEmail');
      await doQuery(inviteUserToProjectQuery, {projectId, email: userContext.user!.email}, {context: managerContext});
      expect(await testEntityManager.findOne(UserProjectModel, {projectId, userId}))
        .toEqual(expect.objectContaining({ role: UPRO.INVITED }));
      expect(invitationEmailSpy)
        .toHaveBeenCalledWith(
          expect.objectContaining({id: userId}),
          expect.objectContaining({id: manager.id}),
          expect.objectContaining({id: projectId}));

      await doQuery(acceptProjectInvitationQuery, {projectId});
      expect(await testEntityManager.findOne(UserProjectModel, {projectId, userId}))
        .toEqual(expect.objectContaining({ role: UPRO.MEMBER }));

      await doQuery(removeUserFromProjectQuery, {projectId, userId}, {context: managerContext});
      expect(await testEntityManager.findOne(UserProjectModel, {projectId, userId}))
        .toEqual(undefined);
    });

    test('Manager invites user, user declines', async () => {
      await doQuery(inviteUserToProjectQuery, {projectId, email: userContext.user!.email}, {context: managerContext});
      expect(await testEntityManager.findOne(UserProjectModel, {projectId, userId}))
        .toEqual(expect.objectContaining({ role: UPRO.INVITED }));

      await doQuery(leaveProjectQuery, {projectId});
      expect(await testEntityManager.findOne(UserProjectModel, {projectId, userId}))
        .toEqual(undefined);
    });

    test('User attempts to accept non-existent invitation', async () => {
      await expect(doQuery(acceptProjectInvitationQuery, {projectId})).rejects.toThrow('Unauthorized');
    });

    test('Non-manager attempts to send invitation', async () => {
      await expect(doQuery(inviteUserToProjectQuery, {projectId, email: userContext.user!.email}))
        .rejects.toThrow('Unauthorized');
    });

    test('Manager invites non-existent user, user creates account and accepts', async () => {
      const invitationEmailSpy = jest.spyOn(auth, 'sendInvitationEmail');
      const email = 'newuser123@example.com';

      await doQuery(inviteUserToProjectQuery, {projectId, email}, {context: managerContext});
      expect(await testEntityManager.findOne(UserModel, {
        where: {notVerifiedEmail: email},
        relations: ['projects']
      }))
        .toEqual(expect.objectContaining({
          projects: [expect.objectContaining({role: UPRO.INVITED, projectId})]
        }));
      expect(invitationEmailSpy).toHaveBeenCalledWith(email, expect.anything(), expect.anything());

      await createUserCredentials({email, name: 'new user', password: 'abc123!!'});
      const unverifiedUser = await testEntityManager.findOneOrFail(UserModel, {
        where: { notVerifiedEmail: email },
        relations: ['credentials'],
      });
      await verifyEmail(email, unverifiedUser.credentials.emailVerificationToken!);
      const newuser = await testEntityManager.findOneOrFail(UserModel, {email});
      const newuserContext = getContext(newuser as any, testEntityManager);

      await doQuery(acceptProjectInvitationQuery, {projectId}, {context: newuserContext});
      expect(await testEntityManager.findOne(UserProjectModel, {projectId, userId: newuser.id}))
        .toEqual(expect.objectContaining({ role: UPRO.MEMBER }));
    });

    test('Accepting a request to join should mark imported datasets as approved', async () => {
      const datasets = await Promise.all([1,2].map(() => createTestDataset()));
      const datasetIds = datasets.map(ds => ds.id);
      await testEntityManager.save(UserProjectModel, {userId, projectId, role: UPRO.PENDING});
      await Promise.all(datasets.map(async ds => {
        await testEntityManager.save(DatasetProjectModel, { datasetId: ds.id, projectId, approved: false })
      }));

      await doQuery(acceptRequestToJoinProjectQuery, {projectId, userId}, {context: managerContext});

      expect(await testEntityManager.find(DatasetProjectModel, {datasetId: In(datasetIds)}))
        .toEqual(expect.arrayContaining([
          {datasetId: datasetIds[0], projectId, approved: true},
          {datasetId: datasetIds[1], projectId, approved: true},
        ]));
    });

    test('Accepting an invitation should mark imported datasets as approved', async () => {
      const datasets = await Promise.all([1,2].map(() => createTestDataset()));
      const datasetIds = datasets.map(ds => ds.id);
      await testEntityManager.save(UserProjectModel, {userId, projectId, role: UPRO.INVITED});
      await Promise.all(datasets.map(async ds => {
        await testEntityManager.save(DatasetProjectModel, { datasetId: ds.id, projectId, approved: false })
      }));

      await doQuery(acceptProjectInvitationQuery, {projectId});

      expect(await testEntityManager.find(DatasetProjectModel, {datasetId: In(datasetIds)}))
        .toEqual(expect.arrayContaining([
          {datasetId: datasetIds[0], projectId, approved: true},
          {datasetId: datasetIds[1], projectId, approved: true},
        ]));
    });

    test('Leaving a project should remove imported datasets', async () => {
      const datasets = await Promise.all([1,2].map(() => createTestDataset()));
      const datasetIds = datasets.map(ds => ds.id);
      await testEntityManager.save(UserProjectModel, {userId, projectId, role: UPRO.MEMBER});
      await Promise.all(datasets.map(async ds => {
        await testEntityManager.save(DatasetProjectModel, { datasetId: ds.id, projectId, approved: true })
      }));

      await doQuery(leaveProjectQuery, {projectId});

      expect(await testEntityManager.find(DatasetProjectModel, {datasetId: In(datasetIds)}))
        .toEqual([]);
    });

    test('Removing a user from a project should remove imported datasets', async () => {
      const datasets = await Promise.all([1,2].map(() => createTestDataset()));
      const datasetIds = datasets.map(ds => ds.id);
      await testEntityManager.save(UserProjectModel, {userId, projectId, role: UPRO.MEMBER});
      await Promise.all(datasets.map(async ds => {
        await testEntityManager.save(DatasetProjectModel, { datasetId: ds.id, projectId, approved: true })
      }));

      await doQuery(removeUserFromProjectQuery, {projectId, userId}, {context: managerContext});

      expect(await testEntityManager.find(DatasetProjectModel, {datasetId: In(datasetIds)}))
        .toEqual([]);
    });
  });

  describe('Mutation.importDatasetsIntoProject', () => {
    const importDatasetsIntoProjectQuery = `mutation ($projectId: ID!, $datasetIds: [ID!]!) { importDatasetsIntoProject(projectId: $projectId, datasetIds: $datasetIds) }`;

    test.each([
        [false, UPRO.INVITED],
        [false, UPRO.PENDING],
        [true, UPRO.MEMBER],
        [true, UPRO.MANAGER],
      ])
    (`should set 'approved' to '%s' if the user is a %s`, async (approved: boolean, role: UserProjectRole) => {
      const project = await createTestProject();
      const projectId = project.id;
      const datasets = await Promise.all([1,2].map(() => createTestDataset()));
      const datasetIds = datasets.map(ds => ds.id);
      await testEntityManager.save(UserProjectModel, {userId, projectId, role});
      await Promise.all(datasets.map(async ds => {
        await testEntityManager.save(DatasetProjectModel, { datasetId: ds.id, projectId, approved: true })
      }));
      const bgData = await createBackgroundData({
        datasetsForProjectIds: [projectId],
        datasetsForUserIds: [userId],
      });

      await doQuery(importDatasetsIntoProjectQuery, {projectId, datasetIds});

      expect(await testEntityManager.find(DatasetProjectModel, {datasetId: In(datasetIds)}))
        .toEqual(expect.arrayContaining([
          {datasetId: datasetIds[0], projectId, approved},
          {datasetId: datasetIds[1], projectId, approved},
        ]));
      await validateBackgroundData(bgData);
    });
  });
});